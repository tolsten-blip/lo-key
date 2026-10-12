/// <reference lib="webworker" />
// Runs Spotify's Basic Pitch model off the main thread so the page stays responsive.

import "./worker-shim";
import { BasicPitch, noteFramesToTime, outputToNotesPoly } from "@spotify/basic-pitch";
import type { Note } from "./arrange";

export interface TranscribeRequest {
  samples: Float32Array; // mono, 22050 Hz
  modelUrl: string;
}

export type TranscribeResponse =
  | { type: "progress"; value: number }
  | { type: "done"; notes: Note[] }
  | { type: "error"; message: string };

const post = (msg: TranscribeResponse) => self.postMessage(msg);

// TensorFlow.js does some work in timers, outside our try/catch; report those failures too.
self.addEventListener("error", (e) => post({ type: "error", message: e.message }));
self.addEventListener("unhandledrejection", (e) => post({ type: "error", message: String(e.reason) }));

self.onmessage = async (e: MessageEvent<TranscribeRequest>) => {
  try {
    const { samples, modelUrl } = e.data;
    const model = new BasicPitch(modelUrl);
    const frames: number[][] = [];
    const onsets: number[][] = [];
    await model.evaluateModel(
      samples,
      (f, o) => {
        frames.push(...f);
        onsets.push(...o);
      },
      (value) => post({ type: "progress", value }),
    );

    // Same thresholds as the Python version: onset 0.6, frame 0.3, notes >= ~80 ms.
    const events = noteFramesToTime(outputToNotesPoly(frames, onsets, 0.6, 0.3, 7));
    const notes = events.map((n) => ({
      pitch: n.pitchMidi,
      start: n.startTimeSeconds,
      end: n.startTimeSeconds + n.durationSeconds,
      velocity: n.amplitude,
    }));
    post({ type: "done", notes });
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
