import { detectNotes } from "./detector";

/** Each frame, reports which expected notes are sounding and how strongly. */
export type HeardCallback = (heard: Map<number, number>) => void;

export interface NoteSource {
  start(): Promise<void>;
  stop(): void;
}

/** Listens through the microphone. */
export class MicListener implements NoteSource {
  private ctx?: AudioContext;
  private stream?: MediaStream;
  private frame = 0;
  private mutedUntil = 0;

  constructor(
    private expected: () => number[],
    private onHeard: HeardCallback,
  ) {}

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      // Browser voice processing mangles music; turn it off.
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    this.ctx = new AudioContext();
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 8192; // ~5 Hz resolution at 44.1 kHz, enough to separate low semitones
    analyser.smoothingTimeConstant = 0.2;
    this.ctx.createMediaStreamSource(this.stream).connect(analyser);

    const spectrum = new Float32Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getFloatFrequencyData(spectrum);
      const heard = performance.now() < this.mutedUntil ? new Map() : detectNotes(spectrum, this.ctx!.sampleRate, this.expected());
      this.onHeard(heard);
      this.frame = requestAnimationFrame(tick);
    };
    tick();
  }

  /** Ignore the mic briefly, e.g. while the app plays a hint out loud. */
  mute(ms: number) {
    this.mutedUntil = performance.now() + ms;
  }

  stop() {
    cancelAnimationFrame(this.frame);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close();
  }
}

/** Uses a plugged-in MIDI keyboard, where available. Exact, no tuning needed. */
export class MidiListener implements NoteSource {
  private held = new Map<number, number>();
  private access?: MIDIAccess;

  constructor(private onHeard: HeardCallback) {}

  static supported() {
    return "requestMIDIAccess" in navigator;
  }

  async start() {
    this.access = await navigator.requestMIDIAccess();
    const handle = (e: MIDIMessageEvent) => {
      if (!e.data) return;
      const [status, pitch, velocity] = e.data;
      const kind = status & 0xf0;
      if (kind === 0x90 && velocity > 0) this.held.set(pitch, velocity);
      else if (kind === 0x80 || kind === 0x90) this.held.delete(pitch);
      else return;
      this.onHeard(new Map(this.held));
    };
    const attach = () => this.access!.inputs.forEach((input) => (input.onmidimessage = handle));
    attach();
    this.access.onstatechange = attach;
  }

  inputCount() {
    return this.access?.inputs.size ?? 0;
  }

  stop() {
    this.access?.inputs.forEach((input) => (input.onmidimessage = null));
    if (this.access) this.access.onstatechange = null;
    this.held.clear();
  }
}
