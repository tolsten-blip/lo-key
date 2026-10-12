import { analyzeAudio, type Stage } from "./analysis/analyze";
import { fetchYouTubeAudio, youtubeAvailable } from "./api";
import { DEMO_LESSON } from "./demo";
import { Keyboard } from "./keyboard";
import { MicListener, MidiListener, type NoteSource } from "./listener";
import { buildSteps, noteName } from "./music";
import { Practice } from "./practice";
import { playNotes } from "./synth";
import type { Hand, Lesson, Level } from "./types";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const keyboard = new Keyboard($("keyboard"));
let lesson: Lesson | undefined;
let practice: Practice | undefined;
let source: NoteSource | undefined;
let heard = new Set<number>();

// ---- Loading a song -------------------------------------------------------

type Step = "downloading" | Stage;

const STEP_OF: Record<Step, string> = {
  downloading: "audio",
  decoding: "audio",
  transcribing: "notes",
  arranging: "arrange",
};

function showStep(step: Step, fraction?: number) {
  $("status").hidden = false;
  $("status-text").classList.remove("error");
  $("status-text").textContent = {
    downloading: "Getting the audio from YouTube…",
    decoding: "Reading the audio…",
    transcribing: `Listening for notes… ${Math.round((fraction ?? 0) * 100)}%`,
    arranging: "Simplifying it for piano…",
  }[step];
  const order = ["audio", "notes", "arrange"];
  const at = order.indexOf(STEP_OF[step]);
  document.querySelectorAll<HTMLLIElement>("#steps li").forEach((li) => {
    const i = order.indexOf(li.dataset.step!);
    li.classList.toggle("active", i === at);
    li.classList.toggle("complete", i < at);
  });
}

function showError(message: string) {
  $("status").hidden = false;
  document.querySelectorAll("#steps li").forEach((li) => li.classList.remove("active", "complete"));
  $("status-text").textContent = message;
  $("status-text").classList.add("error");
}

async function run(getAudio: () => Promise<{ data: ArrayBuffer; title: string }>) {
  setBusy(true);
  try {
    const { data, title } = await getAudio();
    const result = await analyzeAudio(data, title, showStep);
    $("status").hidden = true;
    openLesson(result);
  } catch (err) {
    showError((err as Error).message);
  } finally {
    setBusy(false);
  }
}

function setBusy(busy: boolean) {
  document.querySelectorAll<HTMLButtonElement | HTMLInputElement>("#load button, #load input").forEach((el) => (el.disabled = busy));
  $("load").classList.toggle("busy", busy);
}

$("youtube-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const url = $<HTMLInputElement>("youtube-url").value;
  run(() => {
    showStep("downloading");
    return fetchYouTubeAudio(url);
  });
});

$<HTMLInputElement>("upload").addEventListener("change", (e) => {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = ""; // so picking the same file again still triggers a change
  if (file) run(async () => ({ data: await file.arrayBuffer(), title: file.name.replace(/\.[^.]+$/, "") }));
});

$("demo").addEventListener("click", () => {
  $("status").hidden = true;
  openLesson(DEMO_LESSON);
});

// YouTube links need the optional server; without one (e.g. on Netlify),
// songs are uploaded and analyzed right here in the browser.
youtubeAvailable().then((available) => {
  $("youtube-form").hidden = !available;
  $("no-youtube-note").hidden = available;
  document.querySelector(".file-button")!.classList.toggle("primary", !available);
});

// ---- Lesson & practice ----------------------------------------------------

const PX_PER_BEAT = 14; // tuning-dial scale
let levelIndex = 0;

function openLesson(l: Lesson) {
  lesson = l;
  $("lesson").hidden = false;
  $("lesson-title").textContent = l.title;
  $("lesson-meta").textContent = `${l.bpm} BPM · ${formatTime(l.duration)}`;
  buildRuler(l);

  // Knob positions spread over the top of the dial, like a radio's band selector.
  const labels = $("knob-labels");
  labels.replaceChildren(
    ...l.levels.map((level, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "knob-label";
      btn.textContent = String(i + 1);
      btn.title = level.name;
      btn.style.setProperty("--angle", `${knobAngle(i, l.levels.length)}deg`);
      btn.addEventListener("click", () => selectLevel(i));
      return btn;
    }),
  );
  $("knob").setAttribute("aria-valuemin", "1");
  $("knob").setAttribute("aria-valuemax", String(l.levels.length));
  selectLevel(0);
  $("lesson").scrollIntoView({ behavior: "smooth" });
}

const knobAngle = (i: number, count: number) => (count === 1 ? 0 : -70 + (140 * i) / (count - 1));

function selectLevel(index: number) {
  if (!lesson) return;
  levelIndex = index;
  const level: Level = lesson.levels[index];
  $("knob").style.setProperty("--angle", `${knobAngle(index, lesson.levels.length)}deg`);
  $("knob").setAttribute("aria-valuenow", String(index + 1));
  $("knob").setAttribute("aria-valuetext", `${index + 1}: ${level.name}`);
  document.querySelectorAll<HTMLButtonElement>(".knob-label").forEach((b, i) => b.classList.toggle("on", i === index));
  $("level-name").textContent = level.name;
  $("level-desc").textContent = level.description;

  const fresh = new Practice(buildSteps(level.notes));
  if (practice) fresh.framesRequired = practice.framesRequired;
  practice = fresh;

  const pitches = level.notes.map((n) => n.pitch);
  keyboard.setRange(Math.min(...pitches, 60), Math.max(...pitches, 72));
  render();
}

$("knob").addEventListener("click", () => lesson && selectLevel((levelIndex + 1) % lesson.levels.length));
$("knob").addEventListener("keydown", (e) => {
  if (!lesson) return;
  const delta = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
  if (delta === undefined) return;
  e.preventDefault();
  selectLevel(Math.min(Math.max(levelIndex + delta, 0), lesson.levels.length - 1));
});

/** The tuning dial: one tick per beat, a numbered tick at the start of each bar. */
function buildRuler(l: Lesson) {
  const ruler = $("ruler");
  const beats = Math.ceil((l.duration * l.bpm) / 60);
  ruler.style.width = `${beats * PX_PER_BEAT}px`;
  ruler.style.setProperty("--beat", `${PX_PER_BEAT}px`);
  const labels = [];
  for (let bar = 0; bar * 4 < beats; bar++) {
    const label = document.createElement("span");
    label.textContent = String(bar + 1);
    label.style.left = `${bar * 4 * PX_PER_BEAT}px`;
    labels.push(label);
  }
  ruler.replaceChildren(...labels);
}

function render() {
  if (!practice || !lesson) return;
  const step = practice.current;
  const now = new Map<number, Hand>(step?.notes.map((n) => [n.pitch, n.hand]) ?? []);
  const next = new Set(practice.next?.notes.map((n) => n.pitch) ?? []);
  keyboard.update({ now, next, heard });

  const total = practice.steps.length;
  $("progress").textContent = `${Math.min(practice.index + 1, total)} / ${total}`;
  const time = step?.time ?? lesson.duration;
  $("ruler").style.transform = `translateX(${(-time * lesson.bpm * PX_PER_BEAT) / 60}px)`;

  if (practice.done) {
    $("chord").textContent = "Done!";
    $("play-names").textContent = "You played the whole song.";
    return;
  }
  const chord = step && lesson.chords.find((c) => c.start <= step.time + 0.01 && step.time < c.end);
  $("chord").textContent = chord?.name ?? "–";
  $("play-names").textContent = "Play " + [...now.keys()].sort((a, b) => a - b).map(noteName).join(" ");
}

function onHeard(frame: Map<number, number>) {
  if (!practice) return;
  heard = new Set(frame.keys());
  const advanced = practice.hear(frame);
  // Only redraw when something visible changed, not on every audio frame.
  const key = [...heard].sort().join(",");
  if (advanced || key !== lastHeardKey) render();
  lastHeardKey = key;
}
let lastHeardKey = "";

// ---- Input switch: MIC / MIDI, like a radio's AM/FM ------------------------

function setSwitch(active: "mic" | "midi" | null, status: string) {
  $("mic").setAttribute("aria-pressed", String(active === "mic"));
  $("midi").setAttribute("aria-pressed", String(active === "midi"));
  $("listen-status").textContent = status;
}

function stopListening() {
  source?.stop();
  source = undefined;
  heard = new Set();
  setSwitch(null, "Press MIC to start listening.");
  render();
}

$("mic").addEventListener("click", async () => {
  const wasMic = source instanceof MicListener;
  stopListening();
  if (wasMic) return;
  try {
    const mic = new MicListener(() => practice?.watchedPitches() ?? [], onHeard);
    await mic.start();
    source = mic;
    if (practice) practice.framesRequired = 3;
    setSwitch("mic", "Listening. Play the highlighted keys.");
  } catch {
    setSwitch(null, "Couldn't access the microphone. Check your browser's permission settings.");
  }
});

// A MIDI keyboard is exact, so it's offered where the browser supports it.
$("midi").hidden = !MidiListener.supported();
$("midi").addEventListener("click", async () => {
  const wasMidi = source instanceof MidiListener;
  stopListening();
  if (wasMidi) return;
  try {
    const midi = new MidiListener(onHeard);
    await midi.start();
    source = midi;
    if (practice) practice.framesRequired = 1;
    setSwitch("midi", midi.inputCount() ? "Using your MIDI keyboard." : "No MIDI keyboard found yet. Plug one in and it will be picked up.");
  } catch {
    setSwitch(null, "Couldn't access MIDI devices.");
  }
});

// ---- Other controls --------------------------------------------------------

$("hint").addEventListener("click", () => {
  const pitches = practice?.current?.notes.map((n) => n.pitch) ?? [];
  if (!pitches.length) return;
  // Don't let the mic mistake our own hint for the student playing.
  if (source instanceof MicListener) source.mute(1200);
  playNotes(pitches, Number(volume.value));
});

// Fill the fader below its thumb (Firefox does this natively).
const volume = $<HTMLInputElement>("volume");
const paintVolume = () => volume.style.setProperty("--fill", `${Number(volume.value) * 100}%`);
volume.addEventListener("input", paintVolume);
paintVolume();

$("skip").addEventListener("click", () => {
  practice?.advance();
  render();
});

$("back").addEventListener("click", () => {
  practice?.back();
  render();
});

$("restart").addEventListener("click", () => {
  practice?.restart();
  render();
});

function formatTime(seconds: number) {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
