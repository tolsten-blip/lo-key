import { midiToFreq } from "./music";
import type { PlayNote } from "./types";

let ctx: AudioContext | undefined;

function audio(): AudioContext {
  ctx ??= new AudioContext();
  // Browsers start audio suspended until the user interacts; every caller here is a click.
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

/** One soft piano-ish note: quick attack, then a decay that lasts about as long as the note. */
function tone(ac: AudioContext, out: AudioNode, pitch: number, at: number, seconds: number, peak: number) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "triangle";
  osc.frequency.value = midiToFreq(pitch);
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(peak, at + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, at + seconds);
  osc.connect(gain).connect(out);
  osc.start(at);
  osc.stop(at + seconds);
}

/** Play notes right now, so the student can hear what's next. */
export function playNotes(pitches: number[], volume = 0.7, seconds = 0.9) {
  if (volume <= 0) return;
  const ac = audio();
  for (const pitch of pitches) tone(ac, ac.destination, pitch, ac.currentTime, seconds, (0.35 * volume) / pitches.length);
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
    this.master.connect(ac.destination);
    this.origin = ac.currentTime + 0.1 - from;
    this.next = 0;
    this.playing = true;

    const tick = () => {
      const now = ac.currentTime - this.origin;
      for (; this.next < this.notes.length && this.notes[this.next].start < now + LOOKAHEAD; this.next++) {
        const n = this.notes[this.next];
        tone(ac, this.master!, n.pitch, this.origin + n.start, Math.max(n.duration, 0.25) + 0.25, 0.16);
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
