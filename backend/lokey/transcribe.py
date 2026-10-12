"""Audio -> note events, using Spotify's Basic Pitch model."""

from __future__ import annotations

from pathlib import Path

from .arrange import Note


def transcribe(audio_path: Path) -> tuple[list[Note], list[float]]:
    """Return the detected notes and estimated beat times (seconds)."""
    # Heavy imports are deferred so the API starts quickly and tests don't need them.
    import librosa
    from basic_pitch import ICASSP_2022_MODEL_PATH
    from basic_pitch.inference import predict

    _, _, note_events = predict(
        str(audio_path),
        ICASSP_2022_MODEL_PATH,
        onset_threshold=0.6,
        frame_threshold=0.3,
        minimum_note_length=80,
        minimum_frequency=librosa.note_to_hz("A0"),
        maximum_frequency=librosa.note_to_hz("C8"),
    )
    notes = [
        Note(pitch=int(pitch), start=float(start), end=float(end), velocity=float(amp))
        for start, end, pitch, amp, _bends in note_events
    ]

    y, sr = librosa.load(str(audio_path), sr=22050, mono=True)
    _, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
    beats = librosa.frames_to_time(beat_frames, sr=sr).tolist()
    return notes, beats
