import time

import pytest
from fastapi.testclient import TestClient

from lokey import app as app_module
from lokey import youtube
from lokey.arrange import Note


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(app_module, "_jobs", {})
    monkeypatch.setattr(app_module, "_jobs_by_video", {})

    def fake_download(video_id, out_dir):
        out_dir.mkdir(parents=True, exist_ok=True)
        path = out_dir / "a.wav"
        path.write_bytes(b"")
        return youtube.DownloadedAudio(video_id, "Test Song", 4.0, path)

    def fake_transcribe(path):
        notes = [Note(60 + i, i * 0.5, i * 0.5 + 0.4) for i in range(8)]
        return notes, [i * 0.5 for i in range(8)]

    monkeypatch.setattr(youtube, "download_audio", fake_download)
    monkeypatch.setattr(app_module, "_transcribe", fake_transcribe)
    return TestClient(app_module.app)


def wait_for(client, job_id):
    for _ in range(100):
        job = client.get(f"/api/jobs/{job_id}").json()
        if job["status"] in ("done", "error"):
            return job
        time.sleep(0.02)
    raise AssertionError("job never finished")


def test_youtube_job_produces_lesson(client):
    res = client.post("/api/jobs/youtube", json={"url": "https://youtu.be/dQw4w9WgXcQ"})
    assert res.status_code == 200
    job = wait_for(client, res.json()["id"])
    assert job["status"] == "done"
    assert job["title"] == "Test Song"
    assert job["lesson"]["title"] == "Test Song"
    assert len(job["lesson"]["levels"]) == 4


def test_same_video_reuses_job(client):
    a = client.post("/api/jobs/youtube", json={"url": "https://youtu.be/dQw4w9WgXcQ"}).json()
    b = client.post("/api/jobs/youtube", json={"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}).json()
    assert a["id"] == b["id"]


def test_bad_link_is_rejected(client):
    res = client.post("/api/jobs/youtube", json={"url": "https://vimeo.com/1"})
    assert res.status_code == 400
    assert "YouTube" in res.json()["detail"]


def test_download_error_is_reported(client, monkeypatch):
    def boom(video_id, out_dir):
        raise youtube.YouTubeError("That video is too long.")

    monkeypatch.setattr(youtube, "download_audio", boom)
    res = client.post("/api/jobs/youtube", json={"url": "https://youtu.be/aaaaaaaaaaa"})
    job = wait_for(client, res.json()["id"])
    assert job["status"] == "error"
    assert job["error"] == "That video is too long."


def test_upload_job(client):
    res = client.post("/api/jobs/upload", files={"file": ("my song.mp3", b"fake", "audio/mpeg")})
    job = wait_for(client, res.json()["id"])
    assert job["status"] == "done"
    assert job["title"] == "my song"


def test_upload_rejects_non_audio(client):
    res = client.post("/api/jobs/upload", files={"file": ("notes.txt", b"hi", "text/plain")})
    assert res.status_code == 400


def test_unknown_job(client):
    assert client.get("/api/jobs/nope").status_code == 404
