import { submitUpload, submitYouTube, waitForJob } from "./api";
import { DEMO_LESSON } from "./demo";
import { Keyboard } from "./keyboard";
import { MicListener, MidiListener, type NoteSource } from "./listener";
import { buildSteps, noteName } from "./music";
import { Practice } from "./practice";
import { playNotes } from "./synth";
import type { Hand, Job, Lesson, Level } from "./types";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const keyboard = new Keyboard($("keyboard"));
let lesson: Lesson | undefined;
let practice: Practice | undefined;
let source: NoteSource | undefined;
let heard = new Set<number>();

// ---- Loading a song -------------------------------------------------------

const STATUS_TEXT: Record<Job["status"], string> = {
  queued: "Waiting in line…",
  downloading: "Getting the audio…",
  transcribing: "Listening for notes. This takes about as long as the song.",
  arranging: "Simplifying it for piano…",
  done: "Ready!",
  error: "",
};
const STEP_ORDER = ["queued", "downloading", "transcribing", "arranging", "done"];

function showStatus(job: Job) {
  $("status").hidden = false;
  $("status-text").textContent = job.status === "error" ? job.error ?? "Something went wrong." : STATUS_TEXT[job.status];
  $("status-text").classList.toggle("error", job.status === "error");
  const at = STEP_ORDER.indexOf(job.status);
  document.querySelectorAll<HTMLLIElement>("#steps li").forEach((li) => {
    const i = STEP_ORDER.indexOf(li.dataset.step!);
    li.classList.toggle("active", i === at);
    li.classList.toggle("complete", at > i);
  });
}

function showError(message: string) {
  $("status").hidden = false;
  document.querySelectorAll("#steps li").forEach((li) => li.classList.remove("active", "complete"));
  $("status-text").textContent = message;
  $("status-text").classList.add("error");
}

async function run(submit: () => Promise<Job>) {
  setBusy(true);
  try {
    const job = await waitForJob(await submit(), showStatus);
    if (job.status === "done" && job.lesson) openLesson(job.lesson);
  } catch (err) {
    showError((err as Error).message);
  } finally {
    setBusy(false);
  }
}

function setBusy(busy: boolean) {
  document.querySelectorAll<HTMLButtonElement | HTMLInputElement>("#load button, #load input").forEach((el) => (el.disabled = busy));
}

$("youtube-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const url = $<HTMLInputElement>("youtube-url").value;
  run(() => submitYouTube(url));
});

$<HTMLInputElement>("upload").addEventListener("change", (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) run(() => submitUpload(file));
});

$("demo").addEventListener("click", () => {
  $("status").hidden = true;
  openLesson(DEMO_LESSON);
});

if (import.meta.env.VITE_DEMO_ONLY === "true") {
  $("demo-only-note").hidden = false;
  $("youtube-form").hidden = true;
  document.querySelectorAll<HTMLElement>(".file-button, .alt > span").forEach((el) => (el.hidden = true));
  $("demo").textContent = "Start the demo song";
  $("demo").classList.remove("link");
}

// ---- Lesson & practice ----------------------------------------------------

function openLesson(l: Lesson) {
  lesson = l;
  $("lesson").hidden = false;
  $("lesson-title").textContent = l.title;
  $("lesson-meta").textContent = `${l.bpm} BPM · ${formatTime(l.duration)}`;

  const levels = $("levels");
  levels.replaceChildren(
    ...l.levels.map((level, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.role = "radio";
      btn.textContent = `${i + 1}. ${level.name}`;
      btn.addEventListener("click", () => selectLevel(level));
      btn.dataset.level = level.id;
      return btn;
    }),
  );
  selectLevel(l.levels[0]);
  $("lesson").scrollIntoView({ behavior: "smooth" });
}

function selectLevel(level: Level) {
  document.querySelectorAll<HTMLButtonElement>("#levels button").forEach((b) => {
    b.setAttribute("aria-checked", String(b.dataset.level === level.id));
  });
  $("level-desc").textContent = level.description;

  const steps = buildSteps(level.notes);
  const fresh = new Practice(steps);
  if (practice) fresh.framesRequired = practice.framesRequired;
  practice = fresh;

  const pitches = level.notes.map((n) => n.pitch);
  keyboard.setRange(Math.min(...pitches, 60), Math.max(...pitches, 72));
  render();
}

function render() {
  if (!practice || !lesson) return;
  const step = practice.current;
  const now = new Map<number, Hand>(step?.notes.map((n) => [n.pitch, n.hand]) ?? []);
  const next = new Set(practice.next?.notes.map((n) => n.pitch) ?? []);
  keyboard.update({ now, next, heard });

  const total = practice.steps.length;
  $("progress").textContent = `${Math.min(practice.index + 1, total)} / ${total}`;
  $("bar-fill").style.width = `${total ? (100 * practice.index) / total : 0}%`;

  if (practice.done) {
    $("play-names").textContent = "Done!";
    $("chord").textContent = "🎉";
    return;
  }
  const names = [...now.keys()].sort((a, b) => a - b).map(noteName);
  $("play-names").textContent = names.join(" ") || "–";
  const chord = step && lesson.chords.find((c) => c.start <= step.time + 0.01 && step.time < c.end);
  $("chord").textContent = chord?.name ?? "–";
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

function stopListening() {
  source?.stop();
  source = undefined;
  heard = new Set();
  $("listen").textContent = "🎤 Start listening";
  $("midi").textContent = "🎹 Use MIDI keyboard";
  $("listen-status").textContent = "";
  render();
}

$("listen").addEventListener("click", async () => {
  const wasMic = source instanceof MicListener;
  stopListening();
  if (wasMic) return;
  try {
    const mic = new MicListener(() => practice?.watchedPitches() ?? [], onHeard);
    await mic.start();
    source = mic;
    if (practice) practice.framesRequired = 3;
    $("listen").textContent = "⏹ Stop listening";
    $("listen-status").textContent = "Listening through your microphone. Play the highlighted keys.";
  } catch {
    $("listen-status").textContent = "Couldn't access the microphone. Check your browser's permission settings.";
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
    $("midi").textContent = "⏹ Stop MIDI";
    $("listen-status").textContent = midi.inputCount()
      ? "Using your MIDI keyboard."
      : "No MIDI keyboard found yet. Plug one in and it will be picked up.";
  } catch {
    $("listen-status").textContent = "Couldn't access MIDI devices.";
  }
});

$("hint").addEventListener("click", () => {
  const pitches = practice?.current?.notes.map((n) => n.pitch) ?? [];
  if (!pitches.length) return;
  // Don't let the mic mistake our own hint for the student playing.
  if (source instanceof MicListener) source.mute(1200);
  playNotes(pitches);
});

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
