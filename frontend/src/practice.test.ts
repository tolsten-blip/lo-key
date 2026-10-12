import { describe, expect, it } from "vitest";
import { detectNotes } from "./detector";
import { buildSteps, midiToFreq, noteName } from "./music";
import { Practice } from "./practice";
import type { PlayNote } from "./types";

const note = (pitch: number, start: number, hand: "L" | "R" = "R"): PlayNote => ({ pitch, start, duration: 0.5, hand });
const frame = (...pitches: number[]) => new Map(pitches.map((p) => [p, 40]));

describe("buildSteps", () => {
  it("groups notes that start together", () => {
    const steps = buildSteps([note(64, 0.5), note(48, 0, "L"), note(60, 0.01), note(62, 0.5)]);
    expect(steps.map((s) => s.notes.map((n) => n.pitch))).toEqual([[48, 60], [62, 64]]);
  });

  it("names notes", () => {
    expect(noteName(60)).toBe("C4");
    expect(noteName(70)).toBe("Bb4");
  });
});

describe("Practice", () => {
  it("waits until every note of a chord is heard", () => {
    const p = new Practice(buildSteps([note(48, 0), note(52, 0), note(55, 0), note(60, 1)]));
    p.framesRequired = 1;
    expect(p.hear(frame(48, 52))).toBe(false);
    expect(p.index).toBe(0);
    expect(p.hear(frame(48, 52, 55))).toBe(true);
    expect(p.index).toBe(1);
  });

  it("needs a note to be heard for several frames on the mic", () => {
    const p = new Practice(buildSteps([note(60, 0), note(62, 1)]));
    expect(p.hear(frame(60))).toBe(false);
    expect(p.hear(frame())).toBe(false); // blip, streak resets
    expect(p.hear(frame(60))).toBe(false);
    expect(p.hear(frame(60))).toBe(false);
    expect(p.hear(frame(60))).toBe(true);
  });

  it("a held note doesn't count for a repeat of the same note", () => {
    const p = new Practice(buildSteps([note(60, 0), note(60, 1)]));
    p.framesRequired = 1;
    p.hear(frame(60));
    expect(p.index).toBe(1);
    expect(p.hear(frame(60))).toBe(false); // still ringing
    expect(p.hear(frame())).toBe(false); // released
    expect(p.hear(frame(60))).toBe(true); // pressed again
  });

  it("a decaying note that is struck again counts as a new press", () => {
    const p = new Practice(buildSteps([note(60, 0), note(60, 1)]));
    p.framesRequired = 1;
    p.hear(new Map([[60, 40]]));
    p.hear(new Map([[60, 30]])); // fading
    expect(p.hear(new Map([[60, 28]]))).toBe(false);
    expect(p.hear(new Map([[60, 42]]))).toBe(true); // re-struck: jumps up
  });

  it("a note still swelling after it was struck isn't a second press", () => {
    const p = new Practice(buildSteps([note(60, 0), note(60, 1)]));
    p.framesRequired = 1;
    p.hear(new Map([[60, 25]]));
    expect(p.hear(new Map([[60, 33]]))).toBe(false);
    expect(p.hear(new Map([[60, 40]]))).toBe(false);
    expect(p.hear(new Map([[60, 37]]))).toBe(false);
    expect(p.index).toBe(1);
  });

  it("a held left-hand chord can carry over melody steps", () => {
    const p = new Practice(buildSteps([note(48, 0, "L"), note(60, 0), note(62, 1)]));
    p.framesRequired = 1;
    p.hear(frame(48, 60));
    expect(p.hear(frame(48, 62))).toBe(true);
    expect(p.done).toBe(true);
  });

  it("watches spent notes so it can see them released", () => {
    const p = new Practice(buildSteps([note(60, 0), note(64, 1)]));
    p.framesRequired = 1;
    p.hear(frame(60));
    expect(p.watchedPitches().sort()).toEqual([60, 64]);
  });
});

describe("detectNotes", () => {
  const SR = 44100;
  const BINS = 4096;

  function spectrum(peaks: Record<number, number>) {
    const s = new Float32Array(BINS).fill(-100);
    for (const [freq, db] of Object.entries(peaks)) s[Math.round(Number(freq) / (SR / (BINS * 2)))] = db;
    return s;
  }

  it("hears expected notes that stand out from the noise", () => {
    const s = spectrum({ [midiToFreq(60)]: -30, [midiToFreq(64)]: -35 });
    expect([...detectNotes(s, SR, [60, 64, 67]).keys()].sort()).toEqual([60, 64]);
  });

  it("ignores quiet notes", () => {
    const s = spectrum({ [midiToFreq(60)]: -90 });
    expect(detectNotes(s, SR, [60]).size).toBe(0);
  });

  it("doesn't mistake an overtone for the octave above", () => {
    // Student plays C4; its 2nd harmonic shows up at C5.
    const s = spectrum({ [midiToFreq(60)]: -25, [midiToFreq(72)]: -40 });
    expect(detectNotes(s, SR, [72]).size).toBe(0);
    // But if both are expected, both count.
    expect(detectNotes(s, SR, [60, 72]).size).toBe(2);
  });

  it("doesn't hear a neighbouring note in a loud note's spill", () => {
    // A loud G4 whose energy tails off slowly across nearby bins.
    const s = new Float32Array(BINS).fill(-120);
    const binHz = SR / (BINS * 2);
    const g4 = Math.round(midiToFreq(67) / binHz);
    for (let b = g4 - 40; b <= g4 + 40; b++) s[b] = -10 - 3 * Math.abs(b - g4);
    expect(detectNotes(s, SR, [67, 69]).has(67)).toBe(true);
    expect(detectNotes(s, SR, [67, 69]).has(69)).toBe(false);
  });

  it("accepts the second harmonic for low bass notes", () => {
    const s = spectrum({ [midiToFreq(48)]: -100, [midiToFreq(60)]: -35 });
    expect(detectNotes(s, SR, [48]).has(48)).toBe(true);
  });
});
