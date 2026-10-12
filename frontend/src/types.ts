export type Hand = "L" | "R";

export interface PlayNote {
  pitch: number; // MIDI note number, 60 = middle C
  start: number; // seconds
  duration: number;
  hand: Hand;
}

export interface Level {
  id: string;
  name: string;
  description: string;
  notes: PlayNote[];
}

export interface Lesson {
  title: string;
  duration: number;
  bpm: number;
  chords: { start: number; end: number; name: string }[];
  levels: Level[];
}

export type JobStatus = "queued" | "downloading" | "transcribing" | "arranging" | "done" | "error";

export interface Job {
  id: string;
  source: string;
  status: JobStatus;
  title: string | null;
  error: string | null;
  lesson: Lesson | null;
}
