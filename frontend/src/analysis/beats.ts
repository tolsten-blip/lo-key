import type { Note } from "./arrange";

const FPS = 100; // onset envelope resolution

/**
 * Estimate beat times from note onsets.
 *
 * Builds an onset-strength envelope, picks the tempo whose period best lines
 * up with itself (autocorrelation, nudged towards ~120 BPM like librosa), then
 * picks the phase that lands the most onsets on the beat.
 */
export function estimateBeats(notes: Note[], total: number): number[] {
  const len = Math.ceil(total * FPS) + 1;
  if (!notes.length || len < FPS) return [];

  const env = new Float32Array(len);
  for (const n of notes) {
    const i = Math.round(n.start * FPS);
    // Smear each onset slightly so near-misses still line up.
    for (let d = -2; d <= 2; d++) {
      if (i + d >= 0 && i + d < len) env[i + d] += n.velocity * Math.exp(-(d * d) / 2);
    }
  }

  const at = (x: number) => {
    const i = Math.floor(x);
    const f = x - i;
    return i + 1 < len ? env[i] * (1 - f) + env[i + 1] * f : 0;
  };

  let bestBpm = 120;
  let bestScore = -Infinity;
  for (let bpm = 60; bpm <= 180; bpm++) {
    const lag = (60 * FPS) / bpm;
    let corr = 0;
    for (let i = 0; i + lag < len; i++) corr += env[i] * at(i + lag);
    const prior = Math.exp(-0.5 * Math.log2(bpm / 120) ** 2);
    const score = (corr / (len - lag)) * prior;
    if (score > bestScore) [bestBpm, bestScore] = [bpm, score];
  }

  const period = (60 * FPS) / bestBpm;
  let bestOffset = 0;
  let bestHits = -Infinity;
  for (let offset = 0; offset < period; offset++) {
    let hits = 0;
    for (let t = offset; t < len; t += period) hits += at(t);
    if (hits > bestHits) [bestOffset, bestHits] = [offset, hits];
  }

  const beats = [];
  for (let t = bestOffset; t < len; t += period) beats.push(t / FPS);
  return beats;
}
