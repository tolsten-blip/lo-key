import type { PlayNote } from "./types";

const NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const BLACK = new Set([1, 3, 6, 8, 10]);

export const noteName = (midi: number) => NAMES[midi % 12] + (Math.floor(midi / 12) - 1);
export const isBlack = (midi: number) => BLACK.has(midi % 12);
export const midiToFreq = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

export interface Step {
  time: number;
  notes: PlayNote[];
}

/** Group notes that start together into the steps the student plays one at a time. */
export function buildSteps(notes: PlayNote[], tolerance = 0.03): Step[] {
  const sorted = [...notes].sort((a, b) => a.start - b.start || a.pitch - b.pitch);
  const steps: Step[] = [];
  for (const note of sorted) {
    const last = steps[steps.length - 1];
    if (last && note.start - last.time <= tolerance) {
      if (!last.notes.some((n) => n.pitch === note.pitch)) last.notes.push(note);
    } else {
      steps.push({ time: note.start, notes: [note] });
    }
  }
  return steps;
}
