"""Fetch the audio track of a YouTube video so it can be transcribed."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import parse_qs, urlparse

MAX_DURATION_SECONDS = 10 * 60

_VIDEO_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")
_YOUTUBE_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"}


class YouTubeError(ValueError):
    """Raised for links we can't use. The message is safe to show the user."""


@dataclass
class DownloadedAudio:
    video_id: str
    title: str
    duration: float
    path: Path


def parse_video_id(url: str) -> str:
    """Pull the 11-character video id out of any common YouTube link format."""
    url = url.strip()
    if not url:
        raise YouTubeError("Paste a YouTube link first.")
    if "://" not in url:
        url = "https://" + url

    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    video_id = None

    if host in ("youtu.be", "www.youtu.be"):
        video_id = parsed.path.lstrip("/").split("/")[0]
    elif host in _YOUTUBE_HOSTS:
        parts = [p for p in parsed.path.split("/") if p]
        if parts[:1] == ["watch"]:
            video_id = parse_qs(parsed.query).get("v", [None])[0]
        elif len(parts) >= 2 and parts[0] in ("shorts", "embed", "live", "v"):
            video_id = parts[1]
    else:
        raise YouTubeError("That doesn't look like a YouTube link.")

    if not video_id or not _VIDEO_ID.match(video_id):
        raise YouTubeError("Couldn't find a video in that link.")
    return video_id


def canonical_url(video_id: str) -> str:
    return f"https://www.youtube.com/watch?v={video_id}"


def download_audio(video_id: str, out_dir: Path) -> DownloadedAudio:
    """Download the video's audio as a WAV file in ``out_dir``."""
    import yt_dlp

    out_dir.mkdir(parents=True, exist_ok=True)
    base_opts = {"quiet": True, "no_warnings": True, "noplaylist": True}

    try:
        with yt_dlp.YoutubeDL(base_opts) as ydl:
            info = ydl.extract_info(canonical_url(video_id), download=False)
    except yt_dlp.utils.DownloadError as exc:
        raise YouTubeError("YouTube wouldn't give us that video (it may be private or region-locked).") from exc

    if info.get("is_live"):
        raise YouTubeError("Live streams can't be analyzed.")
    duration = float(info.get("duration") or 0)
    if duration > MAX_DURATION_SECONDS:
        raise YouTubeError(f"That video is too long. Pick one under {MAX_DURATION_SECONDS // 60} minutes.")

    opts = {
        **base_opts,
        "format": "bestaudio/best",
        "outtmpl": str(out_dir / f"{video_id}.%(ext)s"),
        "postprocessors": [{"key": "FFmpegExtractAudio", "preferredcodec": "wav"}],
        # Mono 22.05 kHz is what Basic Pitch resamples to anyway.
        "postprocessor_args": ["-ac", "1", "-ar", "22050"],
    }
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            ydl.download([canonical_url(video_id)])
    except yt_dlp.utils.DownloadError as exc:
        raise YouTubeError("Downloading the audio failed. Try again or try another video.") from exc

    return DownloadedAudio(
        video_id=video_id,
        title=info.get("title") or video_id,
        duration=duration,
        path=out_dir / f"{video_id}.wav",
    )
