"""HTTP API: submit a YouTube link or audio file, poll until the lesson is ready."""

from __future__ import annotations

import logging
import shutil
import tempfile
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

from fastapi import FastAPI, File, HTTPException, UploadFile
from pydantic import BaseModel

from . import youtube
from .arrange import build_levels

log = logging.getLogger(__name__)

MAX_UPLOAD_BYTES = 50 * 1024 * 1024
AUDIO_SUFFIXES = {".mp3", ".wav", ".m4a", ".ogg", ".flac", ".aac", ".webm"}

app = FastAPI(title="Piano Lo-Key")


@dataclass
class Job:
    id: str
    source: str
    status: str = "queued"  # queued -> downloading -> transcribing -> arranging -> done | error
    title: str | None = None
    error: str | None = None
    lesson: dict | None = None
    lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    def update(self, **changes) -> None:
        with self.lock:
            for key, value in changes.items():
                setattr(self, key, value)

    def to_dict(self) -> dict:
        with self.lock:
            return {
                "id": self.id,
                "source": self.source,
                "status": self.status,
                "title": self.title,
                "error": self.error,
                "lesson": self.lesson,
            }


# Transcription is CPU-heavy, so jobs run one at a time.
_executor = ThreadPoolExecutor(max_workers=1)
_jobs: dict[str, Job] = {}
_jobs_by_video: dict[str, str] = {}
_jobs_lock = threading.Lock()
_work_dir = Path(tempfile.mkdtemp(prefix="lokey-"))


def _transcribe(path: Path):
    from .transcribe import transcribe

    return transcribe(path)


def _analyze(job: Job, fetch: Callable[[Path], tuple[Path, str, float]]) -> None:
    job_dir = _work_dir / job.id
    try:
        job.update(status="downloading")
        audio_path, title, duration = fetch(job_dir)
        job.update(status="transcribing", title=title)
        notes, beats = _transcribe(audio_path)
        if not duration:
            duration = max((n.end for n in notes), default=0.0)
        job.update(status="arranging")
        lesson = build_levels(notes, beats, duration)
        lesson["title"] = title
        job.update(status="done", lesson=lesson)
    except youtube.YouTubeError as exc:
        job.update(status="error", error=str(exc))
    except Exception:
        log.exception("job %s failed", job.id)
        job.update(status="error", error="Something went wrong analyzing that song.")
    finally:
        shutil.rmtree(job_dir, ignore_errors=True)


def _new_job(source: str) -> Job:
    job = Job(id=uuid.uuid4().hex[:12], source=source)
    with _jobs_lock:
        _jobs[job.id] = job
    return job


class YouTubeRequest(BaseModel):
    url: str


@app.post("/api/jobs/youtube")
def create_youtube_job(req: YouTubeRequest) -> dict:
    try:
        video_id = youtube.parse_video_id(req.url)
    except youtube.YouTubeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    # Re-use a finished or in-flight analysis of the same video.
    with _jobs_lock:
        existing = _jobs.get(_jobs_by_video.get(video_id, ""))
    if existing and existing.status != "error":
        return existing.to_dict()

    job = _new_job(youtube.canonical_url(video_id))
    with _jobs_lock:
        _jobs_by_video[video_id] = job.id

    def fetch(job_dir: Path):
        audio = youtube.download_audio(video_id, job_dir)
        return audio.path, audio.title, audio.duration

    _executor.submit(_analyze, job, fetch)
    return job.to_dict()


@app.post("/api/jobs/upload")
async def create_upload_job(file: UploadFile = File(...)) -> dict:
    name = file.filename or "song"
    suffix = Path(name).suffix.lower()
    if suffix not in AUDIO_SUFFIXES:
        raise HTTPException(status_code=400, detail="Upload an audio file (mp3, wav, m4a, ogg, flac).")
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="That file is too big (50 MB max).")

    job = _new_job(name)

    def fetch(job_dir: Path):
        job_dir.mkdir(parents=True, exist_ok=True)
        path = job_dir / f"upload{suffix}"
        path.write_bytes(data)
        return path, Path(name).stem, 0.0

    _executor.submit(_analyze, job, fetch)
    return job.to_dict()


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str) -> dict:
    with _jobs_lock:
        job = _jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="No such job.")
    return job.to_dict()
