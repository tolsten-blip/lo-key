import type { Step } from "./music";

/**
 * Wait-for-me practice: the lesson only moves on once every note of the
 * current step has been heard.
 *
 * A note that completes one step can't also complete the next one just by
 * ringing on. It has to be released or struck again first, so a repeated
 * note (C, C, C) really does need three presses.
 */
export class Practice {
  index = 0;
  /** Consecutive frames a note must be heard; 1 for MIDI, a few for the noisier mic. */
  framesRequired = 3;

  private streak = new Map<number, number>();
  /** Notes already used for a step, with their loudest and (since then) quietest levels. */
  private spent = new Map<number, { peak: number; low: number }>();

  constructor(public readonly steps: Step[]) {}

  get current(): Step | undefined {
    return this.steps[this.index];
  }

  get next(): Step | undefined {
    return this.steps[this.index + 1];
  }

  get done() {
    return this.index >= this.steps.length;
  }

  /** Pitches the listener should check: the current step plus spent notes we're waiting to see released. */
  watchedPitches(): number[] {
    const pitches = new Set(this.spent.keys());
    this.current?.notes.forEach((n) => pitches.add(n.pitch));
    return [...pitches];
  }

  /** Feed one frame of detected notes. Returns true if the lesson advanced. */
  hear(heard: Map<number, number>): boolean {
    for (const [pitch, s] of this.spent) {
      const level = heard.get(pitch);
      if (level === undefined) {
        this.spent.delete(pitch); // released
      } else if (level > s.peak && s.low > s.peak - 6) {
        s.peak = s.low = level; // still swelling from the original strike
      } else {
        s.low = Math.min(s.low, level);
        // It faded, then jumped back up: struck again.
        if (s.low < s.peak - 6 && level > s.low + 6) this.spent.delete(pitch);
      }
    }

    const step = this.current;
    if (!step) return false;

    for (const { pitch } of step.notes) {
      const fresh = heard.has(pitch) && !this.spent.has(pitch);
      this.streak.set(pitch, fresh ? (this.streak.get(pitch) ?? 0) + 1 : 0);
    }
    if (!step.notes.every((n) => (this.streak.get(n.pitch) ?? 0) >= this.framesRequired)) return false;

    for (const { pitch } of step.notes) {
      const level = heard.get(pitch)!;
      this.spent.set(pitch, { peak: level, low: level });
    }
    this.advance();
    return true;
  }

  advance() {
    this.streak.clear();
    this.index = Math.min(this.index + 1, this.steps.length);
  }

  back() {
    this.streak.clear();
    this.spent.clear();
    this.index = Math.max(this.index - 1, 0);
  }

  restart() {
    this.streak.clear();
    this.spent.clear();
    this.index = 0;
  }
}
