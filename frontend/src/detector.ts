import { midiToFreq } from "./music";

/**
 * Decide which of the expected notes are sounding in one FFT frame.
 *
 * We only ever ask "is C4 playing?" for the handful of notes the student
 * should be playing, which is far more reliable than general transcription.
 * Returns each detected pitch with how far (dB) it stands above the noise.
 */
export interface DetectorOptions {
  /** How far above the noise floor a note must be to count. */
  minAboveFloorDb: number;
  /** Ignore anything quieter than this, whatever the floor. */
  minAbsoluteDb: number;
}

export const DEFAULT_DETECTOR: DetectorOptions = { minAboveFloorDb: 22, minAbsoluteDb: -75 };

export function detectNotes(
  spectrumDb: Float32Array,
  sampleRate: number,
  expected: Iterable<number>,
  opts: DetectorOptions = DEFAULT_DETECTOR,
): Map<number, number> {
  const fftSize = spectrumDb.length * 2;
  const binHz = sampleRate / fftSize;
  const floor = noiseFloor(spectrumDb, binHz);
  const expectedSet = new Set(expected);
  const heard = new Map<number, number>();

  for (const midi of expectedSet) {
    // Small speakers and phone mics barely pick up low fundamentals, so for
    // bass notes accept the second harmonic as evidence too.
    let level = toneLevel(spectrumDb, midiToFreq(midi), binHz);
    if (midi < 52) level = Math.max(level, toneLevel(spectrumDb, midiToFreq(midi + 12), binHz) - 3);
    if (level < opts.minAbsoluteDb || level - floor < opts.minAboveFloorDb) continue;

    // Energy here might just be an overtone of a lower note (octave or
    // octave + fifth). If that lower note is louder and isn't one we expect,
    // assume this is its harmonic.
    const harmonicOf = [midi - 12, midi - 19].some(
      (lower) => !expectedSet.has(lower) && peakNear(spectrumDb, midiToFreq(lower), binHz) > level + 6,
    );
    if (!harmonicOf) heard.set(midi, level - floor);
  }
  return heard;
}

/**
 * Level of a tone at ``freq``, or -Infinity if there's no actual peak there.
 * A loud note spills energy into neighbouring frequencies; checking that the
 * spectrum dips a quarter-tone either side stops G4 from "sounding like" A4.
 */
function toneLevel(spectrumDb: Float32Array, freq: number, binHz: number): number {
  const peak = peakNear(spectrumDb, freq, binHz);
  const center = Math.round(freq / binHz);
  const offset = Math.max(2, Math.round((freq * (2 ** (1 / 24) - 1)) / binHz));
  const sides = Math.max(spectrumDb[center - offset] ?? -Infinity, spectrumDb[center + offset] ?? -Infinity);
  return peak - sides >= 3 ? peak : -Infinity;
}

function peakNear(spectrumDb: Float32Array, freq: number, binHz: number): number {
  const center = Math.round(freq / binHz);
  let peak = -Infinity;
  for (let b = center - 1; b <= center + 1; b++) {
    if (b > 0 && b < spectrumDb.length) peak = Math.max(peak, spectrumDb[b]);
  }
  return peak;
}

function noiseFloor(spectrumDb: Float32Array, binHz: number): number {
  const lo = Math.max(1, Math.floor(50 / binHz));
  const hi = Math.min(spectrumDb.length, Math.ceil(4000 / binHz));
  const band = Array.from(spectrumDb.subarray(lo, hi)).filter(Number.isFinite).sort((a, b) => a - b);
  return band.length ? band[Math.floor(band.length / 2)] : -100;
}
