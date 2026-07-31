# Relay local transcription worker

This service uses Faster-Whisper to transcribe uploaded source files. It can
also process a public source URL after the user confirms they own or are
authorized to monitor it. The worker also exposes metadata inspection and a
credential-free public YouTube search endpoint used by Relay's discovery agent.

The URL collector intentionally:

- accepts only an explicit public-media domain allowlist;
- rejects playlists and videos longer than 60 minutes;
- does not read browser cookies or private sessions;
- does not bypass login, DRM, paywalls, or geographic restrictions.

Authenticated local endpoints:

- `POST /inspect-url` reads public source metadata without downloading media.
- `POST /transcribe-url` downloads an allowlisted source temporarily and
  transcribes it.
- `POST /discover/youtube` searches the public YouTube index without downloading
  candidate videos.
- `POST /extract-frames` returns three JPEG keyframes from an authorized public
  source for visual web detection.

Run it with the root local-services compose file:

```bash
docker compose -f docker-compose.local.yml up --build
```

The first transcription downloads the configured Whisper model. Use
`WHISPER_MODEL=tiny` for the fastest CPU demo or `small` for a stronger
accuracy/speed balance.
