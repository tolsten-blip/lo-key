# Piano Lo-Key

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

## Running it

Requires Python **3.10 or 3.11** (Basic Pitch doesn't support 3.12+ yet),
Node 18+, and `ffmpeg` on your PATH.

```bash
# Backend
python3.11 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
cd backend && ../.venv/bin/uvicorn lokey.app:app --reload --port 8000

# Frontend (in another terminal)
cd frontend && npm install && npm run dev
```

Open http://localhost:5173. To use the mic from a phone on the same network,
run `npm run dev -- --host`. Phone browsers only allow the microphone over
HTTPS (or on localhost), so you'll need a tunnel such as `ngrok` or
`cloudflared`.

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
