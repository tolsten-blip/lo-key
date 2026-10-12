# Piano Lo-Key

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/tolsten-blip/lo-key?quickstart=1)

**Try the demo on your phone:** https://tolsten-blip.github.io/lo-key/ (demo song only)

Turn a song into a beginner piano lesson. Paste a YouTube link (or upload an
audio file), and Piano Lo-Key works out the melody and chords, builds a few
difficulty levels, and then teaches it to you on an on-screen keyboard. It
listens through your microphone (or a MIDI keyboard) and only moves on when
it hears you play the right notes.

## How it works

```
YouTube link ──► yt-dlp ──► Basic Pitch ──► arranger ──► lesson JSON ──► practice UI
 (or upload)     (audio)    (audio → notes)  (melody, chords,           (keyboard + mic)
                                              difficulty levels)
```

**Backend** (`backend/`, Python + FastAPI)
- `lokey/youtube.py`: accepts any common YouTube link format, rejects live
  streams and videos over 10 minutes, and downloads the audio with yt-dlp.
- `lokey/transcribe.py`: converts audio to notes with Spotify's
  [Basic Pitch](https://github.com/spotify/basic-pitch) and finds the beat
  with librosa.
- `lokey/arrange.py`: pulls out the melody (the top voice) and the chords
  (matched against the 24 major and minor triads), then builds four levels:
  1. **Melody**: right hand only, one note per beat, within C4–C5.
  2. **Melody + bass**: adds the chord's root note in the left hand.
  3. **Melody + chords**: the left hand plays a simple triad at each chord
     change, voiced so the hand barely moves.
  4. **Full**: the complete melody, with chords on every beat.
- `lokey/app.py`: the API. Submit a job, then poll it until it's done.
  Analyses run one at a time, and a repeated YouTube link reuses the earlier
  result.

**Frontend** (`frontend/`, TypeScript + Vite, no framework)
- An overhead keyboard: blue keys are the right hand, orange keys the left,
  the faint keys are coming up next, and keys turn green when they're heard.
- **Wait-for-me practice:** the lesson moves on only once every note in the
  current step has been heard. A note has to be struck again to count twice,
  so C-C-C really needs three presses.
- **Mic detection** (`detector.ts`): the app only checks for the few notes it
  expects ("is there a peak at C4?"), which is far more reliable than general
  pitch detection. It ignores overtones and the energy a loud note spills
  into neighbouring frequencies.
- **MIDI keyboard** support, where the browser has Web MIDI. It's exact.
- **🔊 Hear it** plays the current notes. A demo song works without the
  backend.

## Opening the app

### In your browser, with nothing to install (recommended)

Click **Open in GitHub Codespaces** above, then **Create codespace**. The
first launch takes about 5 minutes while it installs everything; after that,
the app opens in a new browser tab by itself. If the tab doesn't open, go to
the **Ports** tab at the bottom of the editor and click the 🌐 globe next to
"Piano Lo-Key".

To come back later, open https://github.com/codespaces and pick your
codespace. It starts in seconds. Codespaces shut down by themselves after 30
minutes of inactivity, so you aren't charged for idle time. Personal accounts
include free hours each month.

### Demo only, on any device

https://tolsten-blip.github.io/lo-key/ has the demo song and mic practice,
but can't analyze new songs, since that needs the Python server.

### On your own computer

You need Python **3.10 or 3.11** (Basic Pitch doesn't support 3.12+ yet),
Node 18+, and `ffmpeg`.

```bash
bash scripts/start.sh   # installs everything on first run, then starts the app
```

Open http://localhost:5173. Phone browsers only allow the microphone over
HTTPS (or on localhost), so to practice on a phone, use Codespaces or a
tunnel such as `ngrok`.

### Tests

```bash
cd backend && ../.venv/bin/python -m pytest
cd frontend && npm test
```

## Known limitations and next steps

- **Full band mixes are noisy.** Basic Pitch hears every instrument, so the
  "top voice" melody sometimes picks up guitar or synth lines and overtones.
  The biggest quality jump will come from separating the vocals first with
  [Demucs](https://github.com/facebookresearch/demucs) and transcribing the
  melody from the vocal track alone.
- Chords are major and minor triads only (no 7ths or sus chords), which is
  usually what you want for beginners.
- Jobs live in memory, so restarting the server forgets them. A real
  deployment needs a job queue and storage.
- No key transposition yet. Moving songs to C, G or F major would make them
  easier for beginners.
- **YouTube:** downloading audio may conflict with YouTube's Terms of
  Service, and songs are usually copyrighted. Fine for personal use; check
  licensing before shipping this publicly.
