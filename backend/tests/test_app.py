from urllib.parse import unquote

import pytest
from fastapi.testclient import TestClient

from lokey import app as app_module
from lokey import youtube


@pytest.fixture
def client(monkeypatch):
    def fake_download(video_id, out_dir):
        out_dir.mkdir(parents=True, exist_ok=True)
        path = out_dir / f"{video_id}.wav"
        path.write_bytes(b"RIFF fake wav")
        return youtube.DownloadedAudio(video_id, "Tëst Söng", 4.0, path)

    monkeypatch.setattr(youtube, "download_audio", fake_download)
    return TestClient(app_module.app)


def test_health_advertises_youtube(client):
    assert client.get("/api/health").json() == {"youtube": True}


def test_returns_audio_with_title(client):
    res = client.post("/api/youtube", json={"url": "https://youtu.be/dQw4w9WgXcQ"})
    assert res.status_code == 200
    assert res.headers["content-type"] == "audio/wav"
    assert unquote(res.headers["x-title"]) == "Tëst Söng"
    assert res.content == b"RIFF fake wav"


def test_cleans_up_downloads(client, monkeypatch, tmp_path):
    monkeypatch.setattr(app_module.tempfile, "mkdtemp", lambda prefix: str(tmp_path / "job"))
    client.post("/api/youtube", json={"url": "https://youtu.be/dQw4w9WgXcQ"})
    assert not (tmp_path / "job").exists()


def test_bad_link_is_rejected(client):
    res = client.post("/api/youtube", json={"url": "https://vimeo.com/1"})
    assert res.status_code == 400
    assert "YouTube" in res.json()["detail"]


def test_download_error_is_reported(client, monkeypatch):
    def boom(video_id, out_dir):
        raise youtube.YouTubeError("That video is too long.")

    monkeypatch.setattr(youtube, "download_audio", boom)
    res = client.post("/api/youtube", json={"url": "https://youtu.be/aaaaaaaaaaa"})
    assert res.status_code == 422
    assert res.json()["detail"] == "That video is too long."
