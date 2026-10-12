import type { Step } from "./music";
import type { Hand } from "./types";

/**
 * A grand staff (treble + bass) showing the current step and what's coming,
 * coloured like the keyboard. Notes are drawn as plain noteheads, evenly
 * spaced: the order of notes matters for practice, not their rhythm.
 */

const SVG = "http://www.w3.org/2000/svg";
const GAP = 10; // distance between staff lines
const TOP = 52; // y of the treble staff's top line (F5)
const STAVES_APART = 72; // treble bottom line to bass top line
const CLEF_W = 58;
const COL_W = 46;
const BEHIND = 1; // past steps shown (faded)
const MAX_AHEAD = 7; // upcoming steps shown on a wide screen

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

  /** Draw the steps around `index`. `heard` marks notes being played right now. */
  render(steps: Step[], index: number, heard: Set<number>, secondsPerBar: number) {
    // Show fewer steps on narrow screens so the notes stay a readable size.
    const available = this.svg.parentElement?.clientWidth || 640;
    const ahead = Math.max(3, Math.min(MAX_AHEAD, Math.floor((available - 70) / 52) - BEHIND - 1));
    const first = Math.max(0, index - BEHIND);
    const shown = steps.slice(first, index + ahead + 1);
    const width = CLEF_W + (BEHIND + ahead + 1) * COL_W + 12;
    const height = bassY(10) + 4;
    this.svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    this.svg.setAttribute("aria-label", steps[index] ? `Play ${steps[index].notes.length} note(s)` : "Song finished");

    const nodes: SVGElement[] = [];
    const colX = (i: number) => CLEF_W + (i - first + 0.5) * COL_W;

    // Highlight band behind the current step.
    if (steps[index]) {
      nodes.push(el("rect", { class: "staff-cursor", x: colX(index) - COL_W / 2 + 4, y: trebleY(44), width: COL_W - 8, height: bassY(12) - trebleY(44), rx: 8 }));
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

    shown.forEach((step, k) => {
      const i = first + k;
      const x = colX(i);
      // Bar line where the song crosses into a new bar.
      const next = steps[i + 1];
      if (next && Math.floor(next.time / secondsPerBar + 1e-6) > Math.floor(step.time / secondsPerBar + 1e-6) && k < shown.length - 1) {
        nodes.push(el("line", { class: "bar-line", x1: x + COL_W / 2, x2: x + COL_W / 2, y1: trebleY(38), y2: bassY(18) }));
      }

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
    });

    this.svg.replaceChildren(...nodes);
  }
}
