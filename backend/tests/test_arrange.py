from lokey.arrange import Chord, Note, build_levels, detect_chords, extract_melody, fit_range, voice_triad

BEAT = 0.5


def song():
    """Two bars of C major then two of A minor, with a melody on top and a bass line."""
    beats = [i * BEAT for i in range(16)]
    notes = []
    melody = [72, 74, 76, 77, 79, 77, 76, 74, 76, 72, 69, 72, 71, 72, 69, 69]
    for i, p in enumerate(melody):
        notes.append(Note(p, i * BEAT, (i + 1) * BEAT - 0.02, 0.9))
        # A quiet inner-voice note that shouldn't win the melody.
        notes.append(Note(p - 7, i * BEAT + 0.01, (i + 1) * BEAT, 0.3))
    for bar, chord in enumerate([[48, 52, 55], [48, 52, 55], [45, 48, 52], [45, 48, 52]]):
        for p in chord:
            notes.append(Note(p, bar * 4 * BEAT, (bar + 1) * 4 * BEAT, 0.7))
    return notes, beats, 16 * BEAT


def test_detects_chord_progression():
    notes, beats, duration = song()
    chords = detect_chords(notes, beats, duration)
    assert [c.name for c in chords] == ["C", "Am"]
    assert chords[0].start == 0 and chords[1].start == 4.0
    assert chords[-1].end == duration


def test_melody_takes_top_voice():
    notes, _, _ = song()
    melody = extract_melody(notes)
    assert [n.pitch for n in melody][:4] == [72, 74, 76, 77]
    assert all(a.end <= b.start for a, b in zip(melody, melody[1:]))


def test_fit_range_keeps_contour():
    line = [Note(p, i, i + 1) for i, p in enumerate([84, 86, 88])]
    assert [n.pitch for n in fit_range(line, 60, 72)] == [60, 62, 64]


def test_triads_stay_in_left_hand_range():
    for root in range(12):
        for minor in (False, True):
            pitches = voice_triad(Chord(0, 1, root, minor))
            assert len(pitches) == 3
            assert 43 <= min(pitches) and max(pitches) <= 59
            assert {p % 12 for p in pitches} == set(Chord(0, 1, root, minor).pitch_classes)


def test_levels_get_progressively_harder():
    notes, beats, duration = song()
    lesson = build_levels(notes, beats, duration)
    assert lesson["bpm"] == 120
    levels = {lvl["id"]: lvl["notes"] for lvl in lesson["levels"]}
    assert list(levels) == ["melody", "bass", "chords", "full"]

    melody_only = levels["melody"]
    assert {n["hand"] for n in melody_only} == {"R"}
    assert all(60 <= n["pitch"] <= 72 for n in melody_only)

    left = lambda lvl: [n for n in levels[lvl] if n["hand"] == "L"]
    assert len(left("bass")) == 2
    assert len(left("chords")) == 6
    assert len(left("full")) > len(left("chords"))
    # Hands never collide.
    for lvl in levels.values():
        lh = [n["pitch"] for n in lvl if n["hand"] == "L"]
        rh = [n["pitch"] for n in lvl if n["hand"] == "R"]
        if lh:
            assert max(lh) < min(rh)


def test_empty_input():
    lesson = build_levels([], [], 10.0)
    assert lesson["chords"] == []
    assert all(lvl["notes"] == [] for lvl in lesson["levels"])
