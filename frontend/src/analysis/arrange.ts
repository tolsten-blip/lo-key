/**
 * Turn raw transcribed notes into beginner-friendly piano parts.
 *
 * The transcription of a full song is dense and noisy. Here we pull out the
 * two things a beginner actually needs, the melody and the chords, and build
 * a few difficulty levels from them:
 *
 * 1. Melody: right hand only, one note per beat, kept within C4-C5.
 * 2. Melody + bass: melody on half-beats, left hand plays the chord root.
 * 3. Melody + chords: left hand plays a simple triad at each chord change.
 * 4. Full: unquantized melody, left hand plays the triad on every beat.
 */

import type { Lesson, PlayNote } from "../types";

export const NOTE_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const MIN_NOTE_SECONDS = 0.06;
const ONSET_TOLERANCE = 0.05;
export const DEFAULT_BEAT_SECONDS = 0.5;

export interface Note {
  pitch: number;
  start: number;
  end: number;
  velocity: number;
}

export interface Chord {
  start: number;
  end: number;
  root: number; // pitch class 0-11
  minor: boolean;
}

const duration = (n: Note) => n.end - n.start;
export const chordName = (c: Chord) => NOTE_NAMES[c.root] + (c.minor ? "m" : "");
export const pitchClasses = (c: Chord) => [c.root, (c.root + (c.minor ? 3 : 4)) % 12, (c.root + 7) % 12];

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function clean(notes: Note[]): Note[] {
  return notes
    .filter((n) => duration(n) >= MIN_NOTE_SECONDS && n.pitch >= 21 && n.pitch <= 108)
    .sort((a, b) => a.start - b.start || b.pitch - a.pitch);
}

/** Beat times covering 0..total, filling gaps the beat tracker left at the ends. */
export function beatGrid(beats: number[], total: number): number[] {
  beats = beats.filter((b) => b >= 0 && b <= total).sort((a, b) => a - b);
  if (beats.length < 4) {
    const grid = [];
    for (let i = 0; i <= Math.floor(total / DEFAULT_BEAT_SECONDS); i++) grid.push(i * DEFAULT_BEAT_SECONDS);
    return grid;
  }
  const step = median(beats.slice(1).map((b, i) => b - beats[i]));
  const head = [];
  for (let t = beats[0] - step; t > step / 2; t -= step) head.unshift(t);
  const tail = [];
  for (let t = beats[beats.length - 1] + step; t < total; t += step) tail.push(t);
  return [0, ...head, ...beats, ...tail];
}

/** Match each window's pitch-class profile against the 24 major/minor triads. */
export function detectChords(notes: Note[], grid: number[], total: number, beatsPerChord = 2): Chord[] {
  const bounds = [...grid.filter((_, i) => i % beatsPerChord === 0), total];
  const chords: Chord[] = [];

  for (let w = 0; w + 1 < bounds.length; w++) {
    const [start, end] = [bounds[w], bounds[w + 1]];
    if (end <= start) continue;
    const chroma = new Array(12).fill(0);
    for (const n of notes) {
      const overlap = Math.min(n.end, end) - Math.max(n.start, start);
      // Bass notes say more about the harmony than melody notes do.
      if (overlap > 0) chroma[n.pitch % 12] += overlap * n.velocity * (n.pitch < 60 ? 1.5 : 1);
    }
    const total = chroma.reduce((a, b) => a + b, 0);
    if (total < 1e-6) {
      if (chords.length) chords[chords.length - 1].end = end;
      continue;
    }
    const score = (c: Chord) => pitchClasses(c).reduce((s, pc) => s + chroma[pc], 0) / total;

    let best: Chord | undefined;
    let bestScore = -Infinity;
    for (let root = 0; root < 12; root++) {
      for (const minor of [false, true]) {
        const c = { start, end, root, minor };
        const s = score(c) - (minor ? 0.01 : 0);
        if (s > bestScore) [best, bestScore] = [c, s];
      }
    }

    // Hold the previous chord unless the new one is clearly better; this
    // stops the left hand from jumping around on passing notes.
    const prev = chords[chords.length - 1];
    if (prev && score(prev) >= bestScore * 0.85) {
      prev.end = end;
      continue;
    }
    chords.push(best!);
  }
  return chords;
}

/** Skyline melody: the highest reasonably loud note at each onset, made monophonic. */
export function extractMelody(notes: Note[], minPitch = 55): Note[] {
  const clusters: Note[][] = [];
  for (const n of notes) {
    if (n.pitch < minPitch) continue;
    const last = clusters[clusters.length - 1];
    if (last && n.start - last[0].start <= ONSET_TOLERANCE) last.push(n);
    else clusters.push([n]);
  }

  const melody = clusters.map((cluster) => {
    const loudest = Math.max(...cluster.map((n) => n.velocity));
    const top = cluster.filter((n) => n.velocity >= 0.4 * loudest).reduce((a, b) => (b.pitch > a.pitch ? b : a));
    return { ...top };
  });
  for (let i = 0; i + 1 < melody.length; i++) melody[i].end = Math.min(melody[i].end, melody[i + 1].start);
  return melody.filter((n) => duration(n) >= MIN_NOTE_SECONDS);
}

/** Keep at most one note per slot (the strongest) and snap it to the slot start. */
export function quantize(melody: Note[], slots: number[], total: number): Note[] {
  const bounds = [...slots, total];
  const out: Note[] = [];
  let i = 0;
  for (let s = 0; s + 1 < bounds.length; s++) {
    const [start, end] = [bounds[s], bounds[s + 1]];
    let best: Note | undefined;
    for (; i < melody.length && melody[i].start < end; i++) {
      const n = melody[i];
      if (n.start >= start - ONSET_TOLERANCE && (!best || duration(n) * n.velocity > duration(best) * best.velocity)) best = n;
    }
    if (best) out.push({ ...best, start, end: Math.max(end, start + duration(best)) });
  }
  for (let k = 0; k + 1 < out.length; k++) out[k].end = Math.min(out[k].end, out[k + 1].start);
  return out;
}

/** Shift the whole line by octaves to sit in [low, high], then fold any stragglers in. */
export function fitRange(notes: Note[], low: number, high: number): Note[] {
  if (!notes.length) return [];
  const shift = 12 * Math.round(((low + high) / 2 - median(notes.map((n) => n.pitch))) / 12);
  return notes.map((n) => {
    let p = n.pitch + shift;
    while (p < low) p += 12;
    while (p > high) p -= 12;
    return { ...n, pitch: p };
  });
}

/** Closest-position triad near `center` so the left hand barely has to move. */
export function voiceTriad(chord: Chord, center = 52, low = 43, high = 59): number[] {
  let best: [number, number[]] | undefined;
  const pcs = pitchClasses(chord);
  for (let inversion = 0; inversion < 3; inversion++) {
    const order = [...pcs.slice(inversion), ...pcs.slice(0, inversion)];
    for (let octave = 2; octave < 6; octave++) {
      const pitches = [12 * octave + order[0]];
      for (const pc of order.slice(1)) {
        let p = 12 * octave + pc;
        while (p <= pitches[pitches.length - 1]) p += 12;
        pitches.push(p);
      }
      if (pitches[0] >= low && pitches[2] <= high) {
        const dist = Math.abs((pitches[0] + pitches[1] + pitches[2]) / 3 - center);
        if (!best || dist < best[0]) best = [dist, pitches];
      }
    }
  }
  return best ? best[1] : [48 + chord.root];
}

export const bassNote = (c: Chord) => (c.root <= 7 ? 48 + c.root : 36 + c.root);

const round = (x: number) => Math.round(x * 1000) / 1000;
const right = (notes: Note[]): PlayNote[] =>
  notes.map((n) => ({ pitch: n.pitch, start: round(n.start), duration: round(duration(n)), hand: "R" }));
const left = (pitches: number[], start: number, end: number): PlayNote[] =>
  pitches.map((pitch) => ({ pitch, start: round(start), duration: round(end - start), hand: "L" }));

export function buildLesson(raw: Note[], beats: number[], total: number, title: string): Lesson {
  const notes = clean(raw);
  const grid = beatGrid(beats, total);
  const half = [...grid, ...grid.slice(1).map((b, i) => (grid[i] + b) / 2)].sort((a, b) => a - b);
  const chords = detectChords(notes, grid, total);
  const melody = extractMelody(notes);

  const level1 = right(fitRange(quantize(melody, grid, total), 60, 72));
  const level2 = [...right(fitRange(quantize(melody, half, total), 60, 76)), ...chords.flatMap((c) => left([bassNote(c)], c.start, c.end))];
  const level3 = [...right(fitRange(quantize(melody, half, total), 60, 79)), ...chords.flatMap((c) => left(voiceTriad(c), c.start, c.end))];
  const level4 = [
    ...right(fitRange(melody, 60, 84)),
    ...chords.flatMap((c) => {
      const onBeats = grid.filter((b) => c.start - 1e-6 <= b && b < c.end);
      const starts = onBeats.length ? onBeats : [c.start];
      return starts.flatMap((b, i) => left(voiceTriad(c), b, starts[i + 1] ?? c.end));
    }),
  ];

  const sorted = (play: PlayNote[]) => play.sort((a, b) => a.start - b.start || a.pitch - b.pitch);
  const beatSeconds = grid.length > 1 ? median(grid.slice(1).map((b, i) => b - grid[i])) : DEFAULT_BEAT_SECONDS;

  return {
    title,
    duration: round(total),
    bpm: Math.round(60 / beatSeconds),
    chords: chords.map((c) => ({ start: round(c.start), end: round(c.end), name: chordName(c) })),
    levels: [
      { id: "melody", name: "Melody", description: "Right hand only, one note per beat.", notes: sorted(level1) },
      { id: "bass", name: "Melody + bass", description: "Add single bass notes in the left hand.", notes: sorted(level2) },
      { id: "chords", name: "Melody + chords", description: "Left hand plays simple three-note chords.", notes: sorted(level3) },
      { id: "full", name: "Full", description: "Complete melody with chords on every beat.", notes: sorted(level4) },
    ],
  };
}
