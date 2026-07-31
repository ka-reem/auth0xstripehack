import base64
import os
import subprocess
import tempfile
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlparse

from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from faster_whisper import WhisperModel
from pydantic import BaseModel, Field, HttpUrl
from yt_dlp import YoutubeDL

MAX_UPLOAD_BYTES = 200 * 1024 * 1024
MAX_SOURCE_SECONDS = 60 * 60
ALLOWED_HOSTS = {
    "youtube.com",
    "youtu.be",
    "tiktok.com",
    "instagram.com",
    "facebook.com",
    "fb.watch",
    "vimeo.com",
    "x.com",
    "twitter.com",
    "reddit.com",
    "redd.it",
    "dailymotion.com",
    "dai.ly",
    "twitch.tv",
}

app = FastAPI(
    title="Relay Local Transcription Worker",
    version="1.0.0",
    description=(
        "Transcribes user-authorized source media with Faster-Whisper. "
        "It does not use cookies, bypass authentication, or access private media."
    ),
)


class UrlTranscriptionRequest(BaseModel):
    url: HttpUrl
    authorized: bool


class PublicDiscoveryRequest(BaseModel):
    queries: list[str] = Field(min_length=1, max_length=4)
    source_url: HttpUrl | None = None


def require_token(authorization: str | None = Header(default=None)) -> None:
    expected = os.getenv("RELAY_WORKER_TOKEN", "").strip()
    if not expected:
        return
    if authorization != f"Bearer {expected}":
        raise HTTPException(status_code=401, detail="Invalid worker token.")


@lru_cache(maxsize=1)
def whisper_model() -> WhisperModel:
    model_name = os.getenv("WHISPER_MODEL", "small")
    device = os.getenv("WHISPER_DEVICE", "cpu")
    compute_type = os.getenv(
        "WHISPER_COMPUTE_TYPE",
        "int8" if device == "cpu" else "float16",
    )
    return WhisperModel(model_name, device=device, compute_type=compute_type)


def transcribe_path(path: Path) -> dict:
    segments, info = whisper_model().transcribe(
        str(path),
        beam_size=5,
        vad_filter=True,
        condition_on_previous_text=False,
    )
    serialized_segments = []
    text_parts = []
    for segment in segments:
        text = segment.text.strip()
        if not text:
            continue
        text_parts.append(text)
        serialized_segments.append(
            {
                "start": round(segment.start, 3),
                "end": round(segment.end, 3),
                "text": text,
            }
        )
    return {
        "text": " ".join(text_parts),
        "language": info.language,
        "language_probability": round(info.language_probability, 4),
        "duration": round(info.duration, 3),
        "segments": serialized_segments,
        "provider": "faster-whisper",
    }


def allowed_public_host(value: str) -> bool:
    host = (urlparse(value).hostname or "").lower().removeprefix("www.")
    return any(host == allowed or host.endswith(f".{allowed}") for allowed in ALLOWED_HOSTS)


def source_context(metadata: dict) -> dict:
    return {
        "source_title": metadata.get("title"),
        "source_description": metadata.get("description"),
        "source_uploader": metadata.get("uploader"),
        "source_channel": metadata.get("channel") or metadata.get("uploader_id"),
        "source_thumbnail": metadata.get("thumbnail"),
        "source_duration": metadata.get("duration"),
        "source_url": metadata.get("webpage_url") or metadata.get("original_url"),
    }


def source_duration(path: Path, metadata: dict) -> float:
    duration = metadata.get("duration")
    if isinstance(duration, (int, float)) and duration > 0:
        return float(duration)
    probe = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return float(probe.stdout.strip() or 0)


def extract_keyframes(path: Path, duration: float, directory: Path) -> list[dict]:
    if duration <= 0:
        timestamps = [0.5, 2.0, 5.0]
    else:
        timestamps = [
            max(0.15, min(duration - 0.05, duration * position))
            for position in (0.18, 0.5, 0.82)
        ]
    frames = []
    seen_timestamps = set()
    for index, timestamp in enumerate(timestamps):
        rounded = round(timestamp, 3)
        if rounded in seen_timestamps:
            continue
        seen_timestamps.add(rounded)
        frame_path = directory / f"frame-{index + 1}.jpg"
        subprocess.run(
            [
                "ffmpeg",
                "-hide_banner",
                "-loglevel",
                "error",
                "-ss",
                str(rounded),
                "-i",
                str(path),
                "-frames:v",
                "1",
                "-vf",
                "scale=960:-2:force_original_aspect_ratio=decrease",
                "-q:v",
                "4",
                "-y",
                str(frame_path),
            ],
            check=True,
            capture_output=True,
        )
        if not frame_path.exists():
            continue
        frames.append(
            {
                "timestamp": rounded,
                "content": base64.b64encode(frame_path.read_bytes()).decode("ascii"),
            }
        )
    return frames


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "model": os.getenv("WHISPER_MODEL", "small"),
        "device": os.getenv("WHISPER_DEVICE", "cpu"),
    }


@app.post("/inspect-url", dependencies=[Depends(require_token)])
def inspect_url(request: UrlTranscriptionRequest) -> dict:
    source_url = str(request.url)
    if not request.authorized:
        raise HTTPException(
            status_code=400,
            detail="Rights-holder authorization must be confirmed.",
        )
    if not allowed_public_host(source_url):
        raise HTTPException(
            status_code=400,
            detail="This source host is not on the public-media allowlist.",
        )
    options = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "noplaylist": True,
    }
    with YoutubeDL(options) as downloader:
        metadata = downloader.extract_info(source_url, download=False)
    return source_context(metadata)


@app.post("/discover/youtube", dependencies=[Depends(require_token)])
def discover_youtube(request: PublicDiscoveryRequest) -> dict:
    queries = []
    for value in request.queries:
        cleaned = " ".join(value.replace('"', " ").split())[:180]
        if cleaned and cleaned.lower() not in {item.lower() for item in queries}:
            queries.append(cleaned)
    if not queries:
        raise HTTPException(status_code=400, detail="At least one query is required.")

    options = {
        "quiet": True,
        "no_warnings": True,
        "extract_flat": "in_playlist",
        "playlistend": 8,
    }
    results = []
    seen = set()
    with YoutubeDL(options) as downloader:
        for query in queries:
            payload = downloader.extract_info(f"ytsearch8:{query}", download=False)
            for entry in payload.get("entries") or []:
                video_id = entry.get("id")
                if not video_id or video_id in seen:
                    continue
                seen.add(video_id)
                results.append(
                    {
                        "id": video_id,
                        "title": entry.get("title"),
                        "description": entry.get("description"),
                        "url": entry.get("webpage_url")
                        or entry.get("url")
                        or f"https://www.youtube.com/watch?v={video_id}",
                        "uploader": entry.get("channel") or entry.get("uploader"),
                        "duration": entry.get("duration"),
                        "timestamp": entry.get("timestamp"),
                        "view_count": entry.get("view_count"),
                        "query": query,
                    }
                )
                if len(results) >= 24:
                    break
            if len(results) >= 24:
                break
    return {"queries": queries, "evaluated": len(results), "results": results}


@app.post("/extract-frames", dependencies=[Depends(require_token)])
def extract_frames(request: UrlTranscriptionRequest) -> dict:
    source_url = str(request.url)
    if not request.authorized:
        raise HTTPException(
            status_code=400,
            detail="Rights-holder authorization must be confirmed.",
        )
    if not allowed_public_host(source_url):
        raise HTTPException(
            status_code=400,
            detail="This source host is not on the public-media allowlist.",
        )

    with tempfile.TemporaryDirectory(prefix="relay-frames-") as directory:
        directory_path = Path(directory)
        output_template = str(directory_path / "source.%(ext)s")
        options = {
            "format": "best[height<=720]/best",
            "outtmpl": output_template,
            "noplaylist": True,
            "quiet": True,
            "no_warnings": True,
            "restrictfilenames": True,
            "max_filesize": MAX_UPLOAD_BYTES,
        }
        with YoutubeDL(options) as downloader:
            metadata = downloader.extract_info(source_url, download=False)
            duration = metadata.get("duration") or 0
            if duration and duration > MAX_SOURCE_SECONDS:
                raise HTTPException(
                    status_code=413,
                    detail="Source videos are limited to 60 minutes.",
                )
            downloaded = downloader.extract_info(source_url, download=True)
            media_path = Path(downloader.prepare_filename(downloaded))
        duration = source_duration(media_path, downloaded)
        if duration > MAX_SOURCE_SECONDS:
            raise HTTPException(
                status_code=413,
                detail="Source videos are limited to 60 minutes.",
            )
        return {
            **source_context(downloaded),
            "frames": extract_keyframes(media_path, duration, directory_path),
        }


@app.post("/transcribe", dependencies=[Depends(require_token)])
async def transcribe_upload(file: UploadFile = File(...)) -> dict:
    suffix = Path(file.filename or "source-media").suffix[:12]
    size = 0
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as temporary:
        temporary_path = Path(temporary.name)
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > MAX_UPLOAD_BYTES:
                temporary_path.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail="Source exceeds 200 MB.")
            temporary.write(chunk)
    try:
        return transcribe_path(temporary_path)
    finally:
        temporary_path.unlink(missing_ok=True)


@app.post("/transcribe-url", dependencies=[Depends(require_token)])
def transcribe_url(request: UrlTranscriptionRequest) -> dict:
    source_url = str(request.url)
    if not request.authorized:
        raise HTTPException(
            status_code=400,
            detail="Rights-holder authorization must be confirmed.",
        )
    if not allowed_public_host(source_url):
        raise HTTPException(
            status_code=400,
            detail="This source host is not on the public-media allowlist.",
        )

    with tempfile.TemporaryDirectory(prefix="relay-source-") as directory:
        output_template = str(Path(directory) / "source.%(ext)s")
        options = {
            "format": "bestaudio/best",
            "outtmpl": output_template,
            "noplaylist": True,
            "quiet": True,
            "no_warnings": True,
            "restrictfilenames": True,
            "max_filesize": MAX_UPLOAD_BYTES,
        }
        with YoutubeDL(options) as downloader:
            metadata = downloader.extract_info(source_url, download=False)
            duration = metadata.get("duration") or 0
            if duration and duration > MAX_SOURCE_SECONDS:
                raise HTTPException(
                    status_code=413,
                    detail="Source videos are limited to 60 minutes.",
                )
            downloaded = downloader.extract_info(source_url, download=True)
            media_path = Path(downloader.prepare_filename(downloaded))
        result = transcribe_path(media_path)
        result.update(source_context(downloaded))
        return result
