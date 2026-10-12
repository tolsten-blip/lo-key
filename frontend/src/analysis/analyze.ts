import type { Lesson } from "../types";
import { buildLesson, type Note } from "./arrange";
import { estimateBeats } from "./beats";
import type { TranscribeRequest, TranscribeResponse } from "./transcribe.worker";

const SAMPLE_RATE = 22050; // what Basic Pitch expects
export const MAX_SECONDS = 10 * 60;

export type Stage = "decoding" | "transcribing" | "arranging";

/** Turn an audio file into a lesson, entirely in the browser. */
export async function analyzeAudio(data: ArrayBuffer, title: string, onProgress: (stage: Stage, fraction?: number) => void): Promise<Lesson> {
  onProgress("decoding");
  const samples = await decodeToMono(data);
  const total = samples.length / SAMPLE_RATE;
  if (total > MAX_SECONDS) throw new Error(`That song is too long. Pick one under ${MAX_SECONDS / 60} minutes.`);

  onProgress("transcribing", 0);
  const notes = await transcribe(samples, (p) => onProgress("transcribing", p));

  onProgress("arranging");
  return buildLesson(notes, estimateBeats(notes, total), total, title);
}

async function decodeToMono(data: ArrayBuffer): Promise<Float32Array> {
  const ctx = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await ctx.decodeAudioData(data);
  } catch {
    throw new Error("Couldn't read that file. Try an mp3, m4a or wav.");
  } finally {
    ctx.close();
  }
  // Rendering through an offline context mixes down to mono and resamples in one go.
  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * SAMPLE_RATE), SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  return (await offline.startRendering()).getChannelData(0);
}

function transcribe(samples: Float32Array, onProgress: (fraction: number) => void): Promise<Note[]> {
  const worker = new Worker(new URL("./transcribe.worker.ts", import.meta.url), { type: "module" });
  return new Promise<Note[]>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<TranscribeResponse>) => {
      const msg = e.data;
      if (msg.type === "progress") onProgress(msg.value);
      else if (msg.type === "done") resolve(msg.notes);
      else reject(new Error("Something went wrong listening for notes. " + msg.message));
    };
    worker.onerror = () => reject(new Error("Something went wrong listening for notes."));
    const request: TranscribeRequest = { samples, modelUrl: `${import.meta.env.BASE_URL}basic-pitch/model.json` };
    worker.postMessage(request, [samples.buffer]);
  }).finally(() => worker.terminate());
}
