import { describe, expect, it } from "vitest";
import { buildLesson, chordName, detectChords, extractMelody, fitRange, pitchClasses, voiceTriad, type Note } from "./arrange";
import { estimateBeats } from "./beats";

const BEAT = 0.5;
const n = (pitch: number, start: number, end: number, velocity = 0.8): Note => ({ pitch, start, end, velocity });

/** Two bars of C major then two of A minor, with a melody on top and a bass line. */
function song() {
  const beats = Array.from({ length: 16 }, (_, i) => i * BEAT);
  const notes: Note[] = [];
  const melody = [72, 74, 76, 77, 79, 77, 76, 74, 76, 72, 69, 72, 71, 72, 69, 69];
  melody.forEach((p, i) => {
    notes.push(n(p, i * BEAT, (i + 1) * BEAT - 0.02, 0.9));
    // A quiet inner-voice note that shouldn't win the melody.
    notes.push(n(p - 7, i * BEAT + 0.01, (i + 1) * BEAT, 0.3));
  });
  [[48, 52, 55], [48, 52, 55], [45, 48, 52], [45, 48, 52]].forEach((chord, bar) => {
    for (const p of chord) notes.push(n(p, bar * 4 * BEAT, (bar + 1) * 4 * BEAT, 0.7));
  });
  return { notes: notes.sort((a, b) => a.start - b.start || b.pitch - a.pitch), beats, total: 16 * BEAT };
}

describe("arrange", () => {
  it("detects the chord progression", () => {
    const { notes, beats, total } = song();
    const chords = detectChords(notes, beats, total);
    expect(chords.map(chordName)).toEqual(["C", "Am"]);
    expect(chords[1].start).toBe(4);
    expect(chords[1].end).toBe(total);
  });

  it("takes the top voice as the melody", () => {
    const melody = extractMelody(song().notes);
    expect(melody.slice(0, 4).map((m) => m.pitch)).toEqual([72, 74, 76, 77]);
    melody.slice(1).forEach((m, i) => expect(melody[i].end).toBeLessThanOrEqual(m.start));
  });

  it("keeps the contour when fitting a line into range", () => {
    const line = [84, 86, 88].map((p, i) => n(p, i, i + 1));
    expect(fitRange(line, 60, 72).map((m) => m.pitch)).toEqual([60, 62, 64]);
  });

  it("voices every triad inside the left-hand range", () => {
    for (let root = 0; root < 12; root++) {
      for (const minor of [false, true]) {
        const chord = { start: 0, end: 1, root, minor };
        const pitches = voiceTriad(chord);
        expect(pitches).toHaveLength(3);
        expect(Math.min(...pitches)).toBeGreaterThanOrEqual(43);
        expect(Math.max(...pitches)).toBeLessThanOrEqual(59);
        expect(new Set(pitches.map((p) => p % 12))).toEqual(new Set(pitchClasses(chord)));
      }
    }
  });

  it("builds levels that get progressively harder", () => {
    const { notes, beats, total } = song();
    const lesson = buildLesson(notes, beats, total, "Test");
    expect(lesson.bpm).toBe(120);
    const levels = Object.fromEntries(lesson.levels.map((l) => [l.id, l.notes]));
    expect(Object.keys(levels)).toEqual(["melody", "bass", "chords", "full"]);

    expect(new Set(levels.melody.map((m) => m.hand))).toEqual(new Set(["R"]));
    levels.melody.forEach((m) => expect(m.pitch).toBeGreaterThanOrEqual(60));
    levels.melody.forEach((m) => expect(m.pitch).toBeLessThanOrEqual(72));

    const leftHand = (id: string) => levels[id].filter((m) => m.hand === "L");
    expect(leftHand("bass")).toHaveLength(2);
    expect(leftHand("chords")).toHaveLength(6);
    expect(leftHand("full").length).toBeGreaterThan(leftHand("chords").length);
    // Hands never collide.
    for (const level of Object.values(levels)) {
      const lh = level.filter((m) => m.hand === "L").map((m) => m.pitch);
      const rh = level.filter((m) => m.hand === "R").map((m) => m.pitch);
      if (lh.length) expect(Math.max(...lh)).toBeLessThan(Math.min(...rh));
    }
  });

  it("handles empty input", () => {
    const lesson = buildLesson([], [], 10, "Silence");
    expect(lesson.chords).toEqual([]);
    lesson.levels.forEach((l) => expect(l.notes).toEqual([]));
  });
});

describe("estimateBeats", () => {
  it("finds the tempo and phase of a steady rhythm", () => {
    // 100 BPM, starting 0.3s in, with an off-beat note now and then.
    const notes: Note[] = [];
    for (let i = 0; i < 32; i++) {
      notes.push(n(60, 0.3 + i * 0.6, 0.6 + i * 0.6, 0.9));
      if (i % 4 === 1) notes.push(n(64, 0.6 + i * 0.6, 0.8 + i * 0.6, 0.4));
    }
    const beats = estimateBeats(notes, 20);
    const gaps = beats.slice(1).map((b, i) => b - beats[i]);
    gaps.forEach((g) => expect(g).toBeCloseTo(0.6, 2));
    expect(beats[0]).toBeCloseTo(0.3, 1);
  });

  it("returns nothing for silence", () => {
    expect(estimateBeats([], 10)).toEqual([]);
  });
});
