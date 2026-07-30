# Relay local transcription worker

This service uses Faster-Whisper to transcribe uploaded source files. It can
also process a public source URL after the user confirms they own or are
authorized to monitor it.

The URL collector intentionally:

- accepts only an explicit public-media domain allowlist;
- rejects playlists and videos longer than 60 minutes;
- does not read browser cookies or private sessions;
- does not bypass login, DRM, paywalls, or geographic restrictions.

Run it with the root local-services compose file:

```bash
docker compose -f docker-compose.local.yml up --build
```

The first transcription downloads the configured Whisper model. Use
`WHISPER_MODEL=tiny` for the fastest CPU demo or `small` for a stronger
accuracy/speed balance.
