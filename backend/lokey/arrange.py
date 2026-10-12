"""Turn raw transcribed notes into beginner-friendly piano parts.

The transcription of a full song is dense and noisy. Here we pull out the two
things a beginner actually needs, the melody and the chords, and build a few
difficulty levels from them:

1. Melody: right hand only, one note per beat, kept within C4-C5.
2. Melody + bass: melody on half-beats, left hand plays the chord root.
3. Melody + chords: left hand plays a simple triad at each chord change.
4. Full: unquantized melody, left hand plays the triad on every beat.
"""

from __future__ import annotations

import statistics
from dataclasses import asdict, dataclass

NOTE_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]
MIN_NOTE_SECONDS = 0.06
ONSET_TOLERANCE = 0.05
DEFAULT_BEAT_SECONDS = 0.5


@dataclass
class Note:
    pitch: int
    start: float
    end: float
    velocity: float = 0.8

    @property
    def duration(self) -> float:
        return self.end - self.start


@dataclass
class PlayNote:
    pitch: int
    start: float
    duration: float
    hand: str  # "R" or "L"


@dataclass
class Chord:
    start: float
    end: float
    root: int  # pitch class 0-11
    minor: bool

    @property
    def name(self) -> str:
        return NOTE_NAMES[self.root] + ("m" if self.minor else "")

    @property
    def pitch_classes(self) -> list[int]:
        third = 3 if self.minor else 4
        return [self.root, (self.root + third) % 12, (self.root + 7) % 12]


def clean(notes: list[Note]) -> list[Note]:
    kept = [n for n in notes if n.duration >= MIN_NOTE_SECONDS and 21 <= n.pitch <= 108]
    return sorted(kept, key=lambda n: (n.start, -n.pitch))


def beat_grid(beats: list[float], duration: float) -> list[float]:
    """Beat times covering 0..duration, filling gaps the beat tracker left at the ends."""
    beats = sorted(b for b in beats if 0 <= b <= duration)
    if len(beats) < 4:
        step = DEFAULT_BEAT_SECONDS
        return [i * step for i in range(int(duration / step) + 1)]

    step = statistics.median(b - a for a, b in zip(beats, beats[1:]))
    head = []
    t = beats[0] - step
    while t > step / 2:
        head.append(t)
        t -= step
    tail = []
    t = beats[-1] + step
    while t < duration:
        tail.append(t)
        t += step
    return [0.0] + head[::-1] + beats + tail


def detect_chords(notes: list[Note], grid: list[float], duration: float, beats_per_chord: int = 2) -> list[Chord]:
    """Match each window's pitch-class profile against the 24 major/minor triads."""
    bounds = grid[::beats_per_chord] + [duration]
    chords: list[Chord] = []

    for start, end in zip(bounds, bounds[1:]):
        if end <= start:
            continue
        chroma = [0.0] * 12
        for n in notes:
            overlap = min(n.end, end) - max(n.start, start)
            if overlap > 0:
                # Bass notes say more about the harmony than melody notes do.
                weight = 1.5 if n.pitch < 60 else 1.0
                chroma[n.pitch % 12] += overlap * n.velocity * weight
        total = sum(chroma)
        if total < 1e-6:
            if chords:
                chords[-1].end = end
            continue

        scored = []
        for root in range(12):
            for minor in (False, True):
                c = Chord(start, end, root, minor)
                score = sum(chroma[pc] for pc in c.pitch_classes) / total
                scored.append((score - (0.01 if minor else 0), c))
        best_score, best = max(scored, key=lambda s: s[0])

        # Hold the previous chord unless the new one is clearly better; this
        # stops the left hand from jumping around on passing notes.
        if chords:
            prev = chords[-1]
            prev_score = sum(chroma[pc] for pc in prev.pitch_classes) / total
            if prev_score >= best_score * 0.85:
                prev.end = end
                continue
        chords.append(best)

    return chords


def extract_melody(notes: list[Note], min_pitch: int = 55) -> list[Note]:
    """Skyline melody: the highest reasonably loud note at each onset, made monophonic."""
    candidates = [n for n in notes if n.pitch >= min_pitch]
    clusters: list[list[Note]] = []
    for n in candidates:
        if clusters and n.start - clusters[-1][0].start <= ONSET_TOLERANCE:
            clusters[-1].append(n)
        else:
            clusters.append([n])

    melody = []
    for cluster in clusters:
        loudest = max(n.velocity for n in cluster)
        top = max((n for n in cluster if n.velocity >= 0.4 * loudest), key=lambda n: n.pitch)
        melody.append(Note(top.pitch, top.start, top.end, top.velocity))

    for a, b in zip(melody, melody[1:]):
        a.end = min(a.end, b.start)
    return [n for n in melody if n.duration >= MIN_NOTE_SECONDS]


def quantize(melody: list[Note], slots: list[float], duration: float) -> list[Note]:
    """Keep at most one note per slot (the strongest) and snap it to the slot start."""
    bounds = slots + [duration]
    out: list[Note] = []
    i = 0
    for start, end in zip(bounds, bounds[1:]):
        best = None
        while i < len(melody) and melody[i].start < end:
            n = melody[i]
            if n.start >= start - ONSET_TOLERANCE and (best is None or n.duration * n.velocity > best.duration * best.velocity):
                best = n
            i += 1
        if best is not None:
            out.append(Note(best.pitch, start, max(end, start + best.duration), best.velocity))
    for a, b in zip(out, out[1:]):
        a.end = min(a.end, b.start)
    return out


def fit_range(notes: list[Note], low: int, high: int) -> list[Note]:
    """Shift the whole line by octaves to sit in [low, high], then fold any stragglers in."""
    if not notes:
        return []
    center = (low + high) / 2
    median = statistics.median(n.pitch for n in notes)
    shift = 12 * round((center - median) / 12)
    out = []
    for n in notes:
        p = n.pitch + shift
        while p < low:
            p += 12
        while p > high:
            p -= 12
        out.append(Note(p, n.start, n.end, n.velocity))
    return out


def voice_triad(chord: Chord, center: int = 52, low: int = 43, high: int = 59) -> list[int]:
    """Closest-position triad near ``center`` so the left hand barely has to move."""
    best = None
    for inversion in range(3):
        pcs = chord.pitch_classes[inversion:] + chord.pitch_classes[:inversion]
        for octave in range(2, 6):
            pitches = [12 * octave + pcs[0]]
            for pc in pcs[1:]:
                p = 12 * octave + pc
                while p <= pitches[-1]:
                    p += 12
                pitches.append(p)
            if pitches[0] >= low and pitches[-1] <= high:
                dist = abs(sum(pitches) / 3 - center)
                if best is None or dist < best[0]:
                    best = (dist, pitches)
    return best[1] if best else [48 + chord.root]


def bass_note(chord: Chord) -> int:
    return 48 + chord.root if chord.root <= 7 else 36 + chord.root


def _right(notes: list[Note]) -> list[PlayNote]:
    return [PlayNote(n.pitch, round(n.start, 3), round(n.duration, 3), "R") for n in notes]


def _left(pitches: list[int], start: float, end: float) -> list[PlayNote]:
    return [PlayNote(p, round(start, 3), round(end - start, 3), "L") for p in pitches]


def build_levels(notes: list[Note], beats: list[float], duration: float) -> dict:
    notes = clean(notes)
    grid = beat_grid(beats, duration)
    half = sorted(grid + [(a + b) / 2 for a, b in zip(grid, grid[1:])])
    chords = detect_chords(notes, grid, duration)
    melody = extract_melody(notes)

    level1 = _right(fit_range(quantize(melody, grid, duration), 60, 72))

    level2 = _right(fit_range(quantize(melody, half, duration), 60, 76))
    for c in chords:
        level2 += _left([bass_note(c)], c.start, c.end)

    level3 = _right(fit_range(quantize(melody, half, duration), 60, 79))
    for c in chords:
        level3 += _left(voice_triad(c), c.start, c.end)

    level4 = _right(fit_range(melody, 60, 84))
    for c in chords:
        chord_beats = [b for b in grid if c.start - 1e-6 <= b < c.end] or [c.start]
        for b, nb in zip(chord_beats, chord_beats[1:] + [c.end]):
            level4 += _left(voice_triad(c), b, nb)

    levels = [
        ("melody", "Melody", "Right hand only, one note per beat.", level1),
        ("bass", "Melody + bass", "Add single bass notes in the left hand.", level2),
        ("chords", "Melody + chords", "Left hand plays simple three-note chords.", level3),
        ("full", "Full", "Complete melody with chords on every beat.", level4),
    ]
    beat_seconds = statistics.median(b - a for a, b in zip(grid, grid[1:])) if len(grid) > 1 else DEFAULT_BEAT_SECONDS

    return {
        "duration": round(duration, 3),
        "bpm": round(60 / beat_seconds),
        "chords": [{"start": round(c.start, 3), "end": round(c.end, 3), "name": c.name} for c in chords],
        "levels": [
            {
                "id": level_id,
                "name": name,
                "description": desc,
                "notes": [asdict(n) for n in sorted(play, key=lambda n: (n.start, n.pitch))],
            }
            for level_id, name, desc, play in levels
        ],
    }
