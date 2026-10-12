import { midiToFreq } from "./music";
import type { PlayNote } from "./types";

let ctx: AudioContext | undefined;
let out: AudioNode | undefined;

function audio(): AudioContext {
  ctx ??= new AudioContext();
  // Browsers start audio suspended until the user interacts; every caller here is a click.
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

/** Everything plays through a gentle compressor so big chords don't clip. */
function output(ac: AudioContext): AudioNode {
  if (!out) {
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 4;
    comp.connect(ac.destination);
    out = comp;
  }
  return out;
}

// ---- Piano samples -----------------------------------------------------------
// Salamander Grand Piano (Yamaha C5) by Alexander Holm, CC BY 3.0. One recording
// every minor third from A0 to C8; notes in between are pitched up or down a semitone.

const SAMPLE_NAMES: Record<number, string> = { 0: "C", 3: "Ds", 6: "Fs", 9: "A" };
const LOWEST = 21; // A0
const HIGHEST = 108; // C8
const buffers = new Map<number, AudioBuffer>();
const loading = new Map<number, Promise<void>>();

/** The sampled note closest to `pitch` (never more than a semitone away). */
export const nearestSample = (pitch: number) =>
  Math.min(HIGHEST, Math.max(LOWEST, LOWEST + 3 * Math.round((pitch - LOWEST) / 3)));

const sampleUrl = (midi: number) =>
  `${import.meta.env.BASE_URL}piano/${SAMPLE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}.mp3`;

/** Fetch the recordings needed for these notes. Until they arrive, a simple tone stands in. */
export function preloadPiano(pitches: Iterable<number>): Promise<void> {
  const ac = ctx ?? new AudioContext(); // decoding works before the user has clicked
  ctx = ac;
  const jobs = [];
  for (const midi of new Set([...pitches].map(nearestSample))) {
    if (!loading.has(midi)) {
      loading.set(
        midi,
        fetch(sampleUrl(midi))
          .then((res) => res.arrayBuffer())
          .then((data) => ac.decodeAudioData(data))
          .then((buffer) => void buffers.set(midi, buffer))
          .catch(() => void loading.delete(midi)), // try again next time
      );
    }
    jobs.push(loading.get(midi)!);
  }
  return Promise.all(jobs).then(() => undefined);
}

/**
 * One note, held for `held` seconds and then let go: the piano recording if it's
 * loaded (with a damper-like fade on release), otherwise a soft synth tone.
 */
function tone(ac: AudioContext, dest: AudioNode, pitch: number, at: number, held: number, peak: number) {
  const gain = ac.createGain();
  gain.connect(dest);
  const sample = nearestSample(pitch);
  const buffer = buffers.get(sample);

  if (buffer) {
    const src = ac.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = 2 ** ((pitch - sample) / 12);
    gain.gain.setValueAtTime(peak, at);
    gain.gain.setTargetAtTime(0, at + held, 0.08);
    src.connect(gain);
    src.start(at);
    src.stop(at + held + 0.6);
    return;
  }

  preloadPiano([pitch]);
  const osc = ac.createOscillator();
  osc.type = "triangle";
  osc.frequency.value = midiToFreq(pitch);
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(peak * 0.5, at + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, at + held + 0.3);
  osc.connect(gain);
  osc.start(at);
  osc.stop(at + held + 0.3);
}

/** Play notes right now, so the student can hear what's next. */
export function playNotes(pitches: number[], volume = 0.7, held = 1.2) {
  if (volume <= 0) return;
  const ac = audio();
  const peak = (0.9 * volume) / Math.sqrt(pitches.length);
  for (const pitch of pitches) tone(ac, output(ac), pitch, ac.currentTime, held, peak);
}

const LOOKAHEAD = 0.3; // seconds of notes scheduled ahead of the playhead

/** Plays a whole part at its own tempo, reporting the playhead every frame. */
export class Playback {
  playing = false;
  private master?: GainNode;
  private notes: PlayNote[] = [];
  private next = 0;
  private origin = 0; // audio-clock time at which song time 0 would have been
  private frame = 0;

  constructor(
    private onTick: (time: number, sounding: PlayNote[]) => void,
    private onEnd: () => void,
  ) {}

  start(notes: PlayNote[], from: number, volume: number) {
    this.stop();
    const ac = audio();
    this.notes = notes.filter((n) => n.start >= from - 0.01).sort((a, b) => a.start - b.start);
    if (!this.notes.length) return;
    const end = Math.max(...this.notes.map((n) => n.start + n.duration));

    this.master = ac.createGain();
    this.master.gain.value = volume;
    this.master.connect(output(ac));
    this.origin = ac.currentTime + 0.1 - from;
    this.next = 0;
    this.playing = true;

    const tick = () => {
      const now = ac.currentTime - this.origin;
      for (; this.next < this.notes.length && this.notes[this.next].start < now + LOOKAHEAD; this.next++) {
        const n = this.notes[this.next];
        tone(ac, this.master!, n.pitch, this.origin + n.start, Math.max(n.duration, 0.2), 0.45);
      }
      this.onTick(Math.max(now, from), this.notes.filter((n) => n.start <= now && now < n.start + n.duration));
      if (now > end + 0.3) {
        this.stop();
        this.onEnd();
        return;
      }
      this.frame = requestAnimationFrame(tick);
    };
    tick();
  }

  setVolume(volume: number) {
    if (this.master && ctx) this.master.gain.setTargetAtTime(volume, ctx.currentTime, 0.05);
  }

  stop() {
    cancelAnimationFrame(this.frame);
    this.playing = false;
    const master = this.master;
    this.master = undefined;
    if (master && ctx) {
      // Fade out rather than click, then drop everything still scheduled.
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
      setTimeout(() => master.disconnect(), 200);
    }
  }
}
