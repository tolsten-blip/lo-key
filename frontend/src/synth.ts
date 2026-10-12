import { midiToFreq } from "./music";

let ctx: AudioContext | undefined;

/** Play notes with a soft piano-ish tone so the student can hear what's next. */
export function playNotes(pitches: number[], seconds = 0.9) {
  ctx ??= new AudioContext();
  const now = ctx.currentTime;
  for (const pitch of pitches) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = midiToFreq(pitch);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.25 / pitches.length, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + seconds);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + seconds);
  }
}
