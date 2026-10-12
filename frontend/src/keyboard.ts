import { isBlack, noteName } from "./music";
import type { Hand } from "./types";

const SVG = "http://www.w3.org/2000/svg";
const WHITE_W = 24;
const WHITE_H = 120;
const BLACK_W = 15;
const BLACK_H = 76;

export interface KeyState {
  /** Keys to press now, coloured by hand. */
  now: Map<number, Hand>;
  /** Keys coming up next, shown as a faint outline. */
  next: Set<number>;
  /** Keys the app can currently hear. */
  heard: Set<number>;
}

/** An overhead piano keyboard drawn as SVG. */
export class Keyboard {
  private keys = new Map<number, { rect: SVGRectElement; label: SVGTextElement }>();
  private svg: SVGSVGElement;

  constructor(private container: HTMLElement) {
    this.svg = document.createElementNS(SVG, "svg");
    this.svg.classList.add("keyboard");
    container.replaceChildren(this.svg);
  }

  /** Draw keys covering ``low``..``high``, widened to whole octaves and at least two of them. */
  setRange(low: number, high: number) {
    low = 12 * Math.floor(Math.min(low, 60) / 12);
    high = 12 * Math.ceil((Math.max(high, low + 23) + 1) / 12) - 1;
    this.svg.replaceChildren();
    this.keys.clear();

    const whites: number[] = [];
    for (let m = low; m <= high; m++) if (!isBlack(m)) whites.push(m);
    this.svg.setAttribute("viewBox", `0 0 ${whites.length * WHITE_W} ${WHITE_H}`);
    this.svg.style.minWidth = `${whites.length * 18}px`;

    const add = (midi: number, x: number, black: boolean) => {
      const rect = document.createElementNS(SVG, "rect");
      const w = black ? BLACK_W : WHITE_W;
      const h = black ? BLACK_H : WHITE_H;
      rect.setAttribute("x", String(x));
      rect.setAttribute("width", String(w));
      rect.setAttribute("height", String(h));
      rect.setAttribute("rx", "3");
      rect.classList.add("key", black ? "black" : "white");

      const label = document.createElementNS(SVG, "text");
      label.setAttribute("x", String(x + w / 2));
      label.setAttribute("y", String(h - 8));
      label.classList.add("key-label");
      // Always label C so beginners can find their place.
      label.textContent = midi % 12 === 0 ? noteName(midi) : "";

      this.svg.append(rect, label);
      this.keys.set(midi, { rect, label });
    };

    whites.forEach((m, i) => add(m, i * WHITE_W, false));
    // Black keys go on top, straddling the line after the white key below them.
    whites.forEach((m, i) => {
      if (isBlack(m + 1) && m + 1 <= high) add(m + 1, (i + 1) * WHITE_W - BLACK_W / 2, true);
    });
  }

  update(state: KeyState) {
    for (const [midi, { rect, label }] of this.keys) {
      const hand = state.now.get(midi);
      rect.classList.toggle("left", hand === "L");
      rect.classList.toggle("right", hand === "R");
      rect.classList.toggle("next", !hand && state.next.has(midi));
      rect.classList.toggle("heard", state.heard.has(midi));
      label.textContent = hand || midi % 12 === 0 ? noteName(midi) : "";
      label.classList.toggle("on", !!hand);
    }
    const first = [...state.now.keys()].sort((a, b) => a - b)[0];
    if (first !== undefined) this.scrollTo(first);
  }

  private scrollTo(midi: number) {
    const rect = this.keys.get(midi)?.rect;
    if (!rect || this.container.scrollWidth <= this.container.clientWidth) return;
    const box = rect.getBoundingClientRect();
    const view = this.container.getBoundingClientRect();
    if (box.left < view.left || box.right > view.right) {
      this.container.scrollBy({ left: box.left - view.left - view.width / 3, behavior: "smooth" });
    }
  }
}
