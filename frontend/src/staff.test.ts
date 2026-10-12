import { describe, expect, it } from "vitest";
import type { Step } from "./music";
import { layoutPage, ledgerLines, staffPosition } from "./staff";

describe("staffPosition", () => {
  it("places notes on the right line or space", () => {
    expect(staffPosition(60)).toEqual({ pos: 28, accidental: "" }); // middle C
    expect(staffPosition(64).pos).toBe(30); // E4, bottom treble line
    expect(staffPosition(77).pos).toBe(38); // F5, top treble line
    expect(staffPosition(57).pos).toBe(26); // A3, top bass line
    expect(staffPosition(43).pos).toBe(18); // G2, bottom bass line
  });

  it("spells accidentals like the app's note names", () => {
    expect(staffPosition(61)).toEqual({ pos: 28, accidental: "♯" }); // C#4
    expect(staffPosition(63)).toEqual({ pos: 30, accidental: "♭" }); // Eb4
    expect(staffPosition(70)).toEqual({ pos: 34, accidental: "♭" }); // Bb4
  });
});

describe("ledgerLines", () => {
  it("adds middle C's ledger line from either hand", () => {
    expect(ledgerLines(28, "R")).toEqual([28]);
    expect(ledgerLines(28, "L")).toEqual([28]);
  });

  it("needs none inside the staves", () => {
    expect(ledgerLines(33, "R")).toEqual([]); // A4
    expect(ledgerLines(22, "L")).toEqual([]); // D3
    expect(ledgerLines(29, "R")).toEqual([]); // D4 hangs below the treble staff
  });

  it("stacks ledger lines above and below", () => {
    expect(ledgerLines(42, "R")).toEqual([40, 42]); // C6
    expect(ledgerLines(14, "L")).toEqual([16, 14]); // C2
    expect(ledgerLines(29, "L")).toEqual([28]); // D4 written in the bass
  });
});

describe("layoutPage", () => {
  // 120 BPM: a bar of 4/4 lasts 2 seconds. One step per beat for 6 bars.
  const steps: Step[] = Array.from({ length: 24 }, (_, i) => ({ time: i * 0.5, notes: [{ pitch: 60, start: i * 0.5, duration: 0.5, hand: "R" as const }] }));
  const pageOf = (index: number) => layoutPage(steps, index, 2).measures.flatMap((m) => m.steps.map((s) => s.index));

  it("shows four measures per page", () => {
    const page = layoutPage(steps, 0, 2);
    expect(page.measures).toHaveLength(4);
    expect(page.measures.map((m) => m.steps.length)).toEqual([4, 4, 4, 4]);
  });

  it("keeps the page still until the next four measures begin", () => {
    expect(pageOf(0)).toEqual(pageOf(15));
    expect(pageOf(16)[0]).toBe(16);
    expect(pageOf(16)).toEqual([16, 17, 18, 19, 20, 21, 22, 23]); // last page: two bars of music, two empty
  });

  it("stays on the last page once the song is finished", () => {
    expect(pageOf(24)).toEqual(pageOf(23));
  });

  it("spaces notes evenly inside each measure, in order", () => {
    const xs = layoutPage(steps, 0, 2).measures.flatMap((m) => m.steps.map((s) => s.x));
    xs.slice(1).forEach((x, i) => expect(x).toBeGreaterThan(xs[i]));
  });

  it("gives busy measures more room", () => {
    const busy: Step[] = Array.from({ length: 12 }, (_, i) => ({ time: i * 0.15, notes: [{ pitch: 60, start: i * 0.15, duration: 0.1, hand: "R" as const }] }));
    const [first, second] = layoutPage(busy, 0, 2).measures;
    expect(first.steps).toHaveLength(12);
    expect(first.width).toBeGreaterThan(second.width);
  });
});
