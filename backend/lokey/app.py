"""Optional server: fetches YouTube audio for the web app, which does the analysis itself.

Browsers can't download YouTube audio directly, so this is the one job that
needs a server. Without it the web app still works with uploaded files.
"""

from __future__ import annotations

import os
import shutil
import tempfile
import threading
from pathlib import Path
from urllib.parse import quote

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.background import BackgroundTask

from . import youtube

app = FastAPI(title="Piano Lo-Key")

# Downloads are network- and ffmpeg-heavy; don't let a crowd pile them up.
_downloads = threading.BoundedSemaphore(2)


@app.get("/api/health")
def health() -> dict:
    return {"youtube": True}


class YouTubeRequest(BaseModel):
    url: str


@app.post("/api/youtube")
def youtube_audio(req: YouTubeRequest) -> FileResponse:
    """Return the video's audio as a WAV file, with its title in the X-Title header."""
    try:
        video_id = youtube.parse_video_id(req.url)
    except youtube.YouTubeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if not _downloads.acquire(timeout=60):
        raise HTTPException(status_code=503, detail="The server is busy. Try again in a minute.")
    work_dir = Path(tempfile.mkdtemp(prefix="lokey-"))
    try:
        audio = youtube.download_audio(video_id, work_dir)
    except youtube.YouTubeError as exc:
        shutil.rmtree(work_dir, ignore_errors=True)
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception:
        shutil.rmtree(work_dir, ignore_errors=True)
        raise
    finally:
        _downloads.release()

    return FileResponse(
        audio.path,
        media_type="audio/wav",
        headers={"X-Title": quote(audio.title), "Access-Control-Expose-Headers": "X-Title"},
        background=BackgroundTask(shutil.rmtree, work_dir, ignore_errors=True),
    )


# In the Docker image the built web app is served from here too, so the whole
# thing lives at one address. Mounted last so it never shadows the API routes.
_static_dir = os.environ.get("LOKEY_STATIC_DIR")
if _static_dir and Path(_static_dir).is_dir():
    app.mount("/", StaticFiles(directory=_static_dir, html=True), name="web")
