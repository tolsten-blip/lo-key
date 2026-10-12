# Piano Lo-Key

Turn a song into a beginner piano lesson. Upload a song's audio file (or, in
the desktop version, paste a YouTube link), and Piano Lo-Key works out the
melody and chords, builds a few difficulty levels, and then teaches it to you
on an on-screen keyboard. It listens through your microphone (or a MIDI
keyboard) and only moves on when it hears you play the right notes.

Everything runs **in your browser**: songs are analyzed on your own device
and never uploaded anywhere. The only part that needs a server is fetching
audio from YouTube, which is optional.

## How it works

```
audio file ─────────────────────┐
                                ▼
YouTube link ──► server ──► Basic Pitch ──► arranger ──► practice UI
(optional)     (yt-dlp)    (audio → notes,  (melody, chords,  (keyboard + mic)
                            in the browser)  difficulty levels)
```

**Web app** (`frontend/`, TypeScript + Vite, no framework)
- `analysis/`: decodes the audio, runs Spotify's
  [Basic Pitch](https://github.com/spotify/basic-pitch) model with
  TensorFlow.js in a background worker, finds the beat, and arranges the
  notes into four levels:
  1. **Melody**: right hand only, one note per beat, within C4–C5.
  2. **Melody + bass**: adds the chord's root note in the left hand.
  3. **Melody + chords**: the left hand plays a simple triad at each chord
     change, voiced so the hand barely moves.
  4. **Full**: the complete melody, with chords on every beat.
- An overhead keyboard: blue keys are the right hand, orange keys the left,
  the faint keys are coming up next, and keys turn green when they're heard.
- **Keys / Notes switch:** show the lesson on a grand staff instead of the
  keyboard, with the same colours, for sight-reading practice. Notes are
  shown as noteheads in order (without rhythm values). Like a printed page,
  the notes stay still while the highlight moves across, then the page turns.
- **Wait-for-me practice:** the lesson moves on only once every note in the
  current step has been heard. A note has to be struck again to count twice,
  so C-C-C really needs three presses.
- **Mic detection** (`detector.ts`): the app only checks for the few notes it
  expects ("is there a peak at C4?"), which is far more reliable than general
  pitch detection. It ignores overtones and the energy a loud note spills
  into neighbouring frequencies.
- **MIDI keyboard** support, where the browser has Web MIDI. It's exact.
- **Tap or click the on-screen keys** to play without a mic. Correct keys stay
  down until the step is complete, so chords can be tapped one key at a time;
  a wrong key flashes red.
- **Play it for me** plays the current level on a sampled grand piano at the
  song's tempo, from the current step, lighting the keys and moving the dial
  as it goes.
- **🔊 Hear it** plays the current notes, and a built-in demo song lets you
  try practice mode straight away.

**Server** (`backend/`, Python + FastAPI, optional)
- `POST /api/youtube`: downloads a video's audio with yt-dlp. It accepts any
  common YouTube link format and rejects live streams and videos over 10
  minutes.
- When the server is running, the web app shows the YouTube box; without
  it, the box is hidden and uploads still work.

## Opening the app

### Netlify (free, public link, no server)

Either way gives you a link that works on phones and laptops, with uploads
and practice. YouTube links need the server, so they're hidden here.

- **Drag and drop:** run `cd frontend && npm install && npm run build`, then
  drag the `frontend/dist` folder onto https://app.netlify.com/drop.
- **Auto-deploy from Git:** in Netlify, choose **Add new site → Import an
  existing project** and pick this repository. `netlify.toml` has the
  settings, and every push redeploys.

### With Docker, on your own computer (includes YouTube links)

Install [Docker Desktop](https://www.docker.com/products/docker-desktop/),
then, from this folder:

```bash
docker build -t lo-key .
docker run -p 7860:7860 lo-key
```

Open http://localhost:7860. The same container also runs on hosts like
Hugging Face Spaces, Render, Railway or Fly.io (it listens on `$PORT`).
YouTube often blocks downloads from cloud servers, though, so YouTube links
work most reliably on your own computer.

### Without Docker, for development

You need Python 3.10+, Node 18+, and `ffmpeg`.

```bash
bash scripts/start.sh   # installs everything on first run, then starts the app
```

Open http://localhost:5173. To skip the server entirely, run
`cd frontend && npm install && npm run dev`; uploads still work.

### GitHub Codespaces / Pages

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/tolsten-blip/lo-key?quickstart=1)

The dev container installs everything and opens the app in a browser tab.
The Pages workflow publishes the web app to
https://tolsten-blip.github.io/lo-key/ once Pages is enabled in the
repository settings (**Settings → Pages → Source: GitHub Actions**).

## Credits

- Piano sound: [Salamander Grand Piano](https://sfzinstruments.github.io/pianos/salamander)
  by Alexander Holm, [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)
  (`frontend/public/piano/`, via [Tone.js's audio repo](https://github.com/Tonejs/audio)).
  Only the recordings a song needs are downloaded.
- Transcription: [Basic Pitch](https://github.com/spotify/basic-pitch) by
  Spotify, Apache 2.0.

## Tests

```bash
cd frontend && npm test
cd backend && ../.venv/bin/python -m pytest
```

## Known limitations and next steps

- **Analysis speed depends on the device.** It runs on the device's graphics
  chip where possible; expect roughly real time on a laptop and slower on
  older phones.
- **Full band mixes are noisy.** Basic Pitch hears every instrument, so the
  "top voice" melody sometimes picks up guitar or synth lines and overtones.
  Separating the vocals first (e.g. with Demucs) would give the biggest
  jump in quality.
- Chords are major and minor triads only (no 7ths or sus chords), which is
  usually what you want for beginners.
- No key transposition yet. Moving songs to C, G or F major would make them
  easier for beginners.
- **YouTube:** downloading audio may conflict with YouTube's Terms of
  Service, and songs are usually copyrighted. Fine for personal use; check
  licensing before shipping this publicly.
