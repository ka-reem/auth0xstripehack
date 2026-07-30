import os
import tempfile
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlparse

from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from faster_whisper import WhisperModel
from pydantic import BaseModel, HttpUrl
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


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "model": os.getenv("WHISPER_MODEL", "small"),
        "device": os.getenv("WHISPER_DEVICE", "cpu"),
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
        result["source_title"] = downloaded.get("title")
        result["source_uploader"] = downloaded.get("uploader")
        return result
