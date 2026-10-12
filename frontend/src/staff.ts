import type { Step } from "./music";
import type { Hand } from "./types";

/**
 * A grand staff (treble + bass) showing four measures at a time, coloured like
 * the keyboard. Notes are drawn as plain noteheads spaced evenly within their
 * measure: the order of notes matters for practice, not their rhythm.
 */

const SVG = "http://www.w3.org/2000/svg";
const GAP = 10; // distance between staff lines
const TOP = 52; // y of the treble staff's top line (F5)
const STAVES_APART = 72; // treble bottom line to bass top line
const CLEF_W = 58;
const MEASURES_PER_PAGE = 4;
const MIN_MEASURE_W = 110;
const STEP_W = 34; // room each step needs in a busy measure
const BAR_PAD = 14; // space after a bar line before the first note

// Letter (C=0 … B=6) and accidental for each pitch class, spelled like the app's note names.
const SPELLING: [number, "" | "♯" | "♭"][] = [
  [0, ""], [0, "♯"], [1, ""], [2, "♭"], [2, ""], [3, ""], [3, "♯"], [4, ""], [5, "♭"], [5, ""], [6, "♭"], [6, ""],
];

/** Diatonic position: C4 = 28, D4 = 29 … one step per line or space. */
export function staffPosition(midi: number): { pos: number; accidental: string } {
  const [letter, accidental] = SPELLING[midi % 12];
  return { pos: letter + 7 * (Math.floor(midi / 12) - 1), accidental };
}

const F5 = 38; // top line of the treble staff
const A3 = 26; // top line of the bass staff
const trebleY = (pos: number) => TOP + ((F5 - pos) * GAP) / 2;
const BASS_TOP = trebleY(30) + STAVES_APART;
const bassY = (pos: number) => BASS_TOP + ((A3 - pos) * GAP) / 2;
/** Right-hand notes are written on the treble staff, left-hand notes on the bass staff. */
const yFor = (pos: number, hand: Hand) => (hand === "R" ? trebleY(pos) : bassY(pos));
const TREBLE_LINES = [30, 32, 34, 36, 38]; // E4 G4 B4 D5 F5
const BASS_LINES = [18, 20, 22, 24, 26]; // G2 B2 D3 F3 A3
const MIDDLE_C = 28;

/** Ledger lines a note needs, given which staff (hand) it's written on. */
export function ledgerLines(pos: number, hand: Hand): number[] {
  const lines = [];
  if (hand === "R") {
    for (let p = 40; p <= pos; p += 2) lines.push(p); // above the treble staff
    if (pos <= MIDDLE_C) lines.push(MIDDLE_C); // down to middle C
  } else {
    for (let p = 16; p >= pos; p -= 2) lines.push(p); // below the bass staff
    if (pos >= MIDDLE_C) lines.push(MIDDLE_C); // up to middle C
    for (let p = 30; p <= pos; p += 2) lines.push(p);
  }
  return lines;
}

export interface PageLayout {
  width: number;
  /** Each measure on the page, with where its steps go. */
  measures: { x: number; width: number; steps: { index: number; x: number }[] }[];
}

const barOf = (step: Step, secondsPerBar: number) => Math.floor(step.time / secondsPerBar + 1e-6);

/**
 * Lay out the page of four measures that contains step `index`, like printed
 * music: each measure gets its own space and its notes are spread evenly in it.
 */
export function layoutPage(steps: Step[], index: number, secondsPerBar: number): PageLayout {
  const onPage = Math.min(index, Math.max(steps.length - 1, 0)); // when finished, stay on the last page
  const firstBar = steps.length ? Math.floor(barOf(steps[onPage], secondsPerBar) / MEASURES_PER_PAGE) * MEASURES_PER_PAGE : 0;

  const byMeasure: number[][] = Array.from({ length: MEASURES_PER_PAGE }, () => []);
  steps.forEach((step, i) => {
    const m = barOf(step, secondsPerBar) - firstBar;
    if (m >= 0 && m < MEASURES_PER_PAGE) byMeasure[m].push(i);
  });

  let x = CLEF_W;
  const measures = byMeasure.map((indexes) => {
    const width = Math.max(MIN_MEASURE_W, indexes.length * STEP_W + BAR_PAD);
    const spacing = (width - BAR_PAD) / Math.max(indexes.length, 1);
    const measure = { x, width, steps: indexes.map((i, k) => ({ index: i, x: x + BAR_PAD / 2 + (k + 0.5) * spacing })) };
    x += width;
    return measure;
  });
  return { width: x + 4, measures };
}

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, text?: string) {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text) node.textContent = text;
  return node;
}

export class Staff {
  private svg: SVGSVGElement;

  constructor(container: HTMLElement) {
    this.svg = document.createElementNS(SVG, "svg");
    this.svg.classList.add("staff");
    this.svg.setAttribute("role", "img");
    container.replaceChildren(this.svg);
  }

  /** Draw the page of four measures around step `index`. `heard` marks notes being played right now. */
  render(steps: Step[], index: number, heard: Set<number>, secondsPerBar: number) {
    // Like a printed page: the notes stay put while the highlight moves across,
    // then the page turns to the next four measures.
    const page = layoutPage(steps, index, secondsPerBar);
    const width = page.width;
    const height = bassY(10) + 4;
    this.svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    this.svg.setAttribute("aria-label", steps[index] ? `Play ${steps[index].notes.length} note(s)` : "Song finished");

    const nodes: SVGElement[] = [];

    // Highlight band behind the current step.
    for (const measure of page.measures) {
      const spot = measure.steps.find((s) => s.index === index);
      if (!spot) continue;
      const band = Math.min(38, (measure.width - BAR_PAD) / measure.steps.length - 4);
      nodes.push(el("rect", { class: "staff-cursor", x: spot.x - band / 2, y: trebleY(44), width: band, height: bassY(12) - trebleY(44), rx: 8 }));
    }

    for (const pos of TREBLE_LINES) nodes.push(el("line", { class: "staff-line", x1: 8, x2: width - 4, y1: trebleY(pos), y2: trebleY(pos) }));
    for (const pos of BASS_LINES) nodes.push(el("line", { class: "staff-line", x1: 8, x2: width - 4, y1: bassY(pos), y2: bassY(pos) }));
    // The line joining both staves, and the clefs. At 4 staff spaces per em, Noto
    // Music's treble clef inks 5.4 spaces above its baseline (7 tall) and its bass
    // clef 3.6 above; place them 1.5 spaces above the treble staff and at the top
    // of the bass staff.
    nodes.push(el("line", { class: "staff-line", x1: 8, x2: 8, y1: trebleY(38), y2: bassY(18) }));
    nodes.push(el("text", { class: "clef", x: 14, y: trebleY(38) + 3.9 * GAP, "font-size": 4 * GAP }, "𝄞"));
    nodes.push(el("text", { class: "clef", x: 14, y: bassY(26) + 3.5 * GAP, "font-size": 4 * GAP }, "𝄢"));

    for (const measure of page.measures) {
      // Bar line closing each measure.
      const barX = measure.x + measure.width;
      nodes.push(el("line", { class: "bar-line", x1: barX, x2: barX, y1: trebleY(38), y2: bassY(18) }));

      for (const { index: i, x } of measure.steps) {
        const step = steps[i];
        const state = i < index ? "past" : i === index ? "now" : "ahead";
        // Seconds (notes a step apart) on the same staff sit side by side.
        const sorted = [...step.notes].sort((a, b) => a.pitch - b.pitch);
        let lastPos = -99;
        let lastShifted = false;
        let lastHand: Hand | undefined;
        for (const note of sorted) {
          const { pos, accidental } = staffPosition(note.pitch);
          if (note.hand !== lastHand) [lastPos, lastShifted, lastHand] = [-99, false, note.hand];
          const shifted: boolean = pos - lastPos === 1 && !lastShifted;
          lastShifted = shifted;
          lastPos = pos;
          const nx = x + (shifted ? 11 : 0);

          for (const ledger of ledgerLines(pos, note.hand)) {
            const ly = yFor(ledger, note.hand);
            nodes.push(el("line", { class: "staff-line ledger", x1: nx - 10, x2: nx + 10, y1: ly, y2: ly }));
          }
          const cls = ["note", state, state === "now" ? (heard.has(note.pitch) ? "heard" : note.hand === "R" ? "right" : "left") : ""].join(" ");
          const ny = yFor(pos, note.hand);
          if (accidental) nodes.push(el("text", { class: `accidental ${cls}`, x: nx - 17, y: ny + 5 }, accidental));
          nodes.push(el("ellipse", { class: cls, cx: nx, cy: ny, rx: 6.4, ry: 4.6, transform: `rotate(-20 ${nx} ${ny})` }));
        }
      }
    }

    this.svg.replaceChildren(...nodes);
  }
}
