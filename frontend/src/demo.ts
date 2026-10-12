import type { Lesson, PlayNote } from "./types";

// "Twinkle Twinkle Little Star" (public domain), so the app can be tried
// without analyzing anything.
const BEAT = 0.5;
const MELODY = [60, 60, 67, 67, 69, 69, 67, 0, 65, 65, 64, 64, 62, 62, 60, 0];
const CHORDS: [string, number, number[]][] = [
  ["C", 48, [48, 52, 55]],
  ["F", 53, [48, 53, 57]],
  ["C", 48, [48, 52, 55]],
  ["G", 43, [47, 50, 55]],
  ["F", 53, [48, 53, 57]],
  ["C", 48, [48, 52, 55]],
  ["G", 43, [47, 50, 55]],
  ["C", 48, [48, 52, 55]],
];

function build(left: "none" | "bass" | "chords"): PlayNote[] {
  const notes: PlayNote[] = [];
  MELODY.forEach((pitch, i) => {
    // A rest at the end of each phrase lengthens the note before it.
    if (pitch) notes.push({ pitch, start: i * BEAT, duration: MELODY[i + 1] === 0 ? 2 * BEAT : BEAT, hand: "R" });
  });
  if (left !== "none") {
    CHORDS.forEach(([, bass, triad], i) => {
      for (const pitch of left === "bass" ? [bass] : triad) {
        notes.push({ pitch, start: i * 2 * BEAT, duration: 2 * BEAT, hand: "L" });
      }
    });
  }
  return notes;
}

export const DEMO_LESSON: Lesson = {
  title: "Twinkle Twinkle Little Star (demo)",
  duration: MELODY.length * BEAT,
  bpm: 120,
  chords: CHORDS.map(([name], i) => ({ name, start: i * 2 * BEAT, end: (i + 1) * 2 * BEAT })),
  levels: [
    { id: "melody", name: "Melody", description: "Right hand only.", notes: build("none") },
    { id: "bass", name: "Melody + bass", description: "Add single bass notes in the left hand.", notes: build("bass") },
    { id: "chords", name: "Melody + chords", description: "Left hand plays simple three-note chords.", notes: build("chords") },
  ],
};
