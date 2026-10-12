import { describe, expect, it } from "vitest";
import { nearestSample } from "./synth";

describe("nearestSample", () => {
  it("uses a recording at most a semitone away", () => {
    for (let pitch = 21; pitch <= 108; pitch++) {
      const sample = nearestSample(pitch);
      expect(Math.abs(sample - pitch)).toBeLessThanOrEqual(1);
      expect([0, 3, 6, 9]).toContain(sample % 12); // C, D#, F#, A
    }
  });

  it("clamps to the ends of the keyboard", () => {
    expect(nearestSample(15)).toBe(21);
    expect(nearestSample(115)).toBe(108);
  });
});
