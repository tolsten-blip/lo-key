import { describe, expect, it } from "vitest";
import { ledgerLines, staffPosition } from "./staff";

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
