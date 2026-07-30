# Relay Rights

Relay registers an original video URL or file, creates a persistent scan job,
and searches supported official platform APIs for public posts with overlapping
metadata. Results are presented as review candidates—not infringement verdicts
or verified visual matches.

The product also includes a clearly labeled controlled benchmark for
credential-free presentations. It demonstrates multimodal evidence,
transformation explanations, persistent human review decisions, case history,
and JSON/print evidence export without presenting synthetic specimens as live
platform detections.

## Local setup

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

The app will choose an available localhost port. The current development
instance for this workspace is running at `http://localhost:3002`.

Provider credentials are optional. Copy `.env.example` to `.env` and add the
keys you have:

```dotenv
YOUTUBE_API_KEY=
VIMEO_ACCESS_TOKEN=
X_BEARER_TOKEN=
```

Without credentials, scans still create and persist successfully. The report
shows each connector as `credentials required` or `restricted` and returns no
fabricated matches.

## Backend flow

1. `POST /api/scan` validates a public URL or multipart video upload.
2. Link metadata is resolved only through supported provider oEmbed endpoints.
3. Uploaded videos are stored privately in the `UPLOADS` R2 bucket with a
   SHA-256 integrity hash.
4. A queued scan record is written to the `DB` D1 database.
5. `GET /api/scan?scan=<id>` processes or retrieves the job.
6. YouTube, Vimeo, and X connectors run in parallel when credentials exist.
7. The report persists provider status, candidates, timestamps, and errors.
8. Human review decisions and notes persist in `scan_reviews`.

## Presentation flow

1. Open `http://localhost:3002`.
2. Select **Run controlled evidence demo**.
3. Let the multi-agent search animation complete.
4. Review visual, audio, temporal, matched-window, and transformation signals.
5. Save a human decision and note.
6. Export or print the evidence report.
7. Open **Case history** to return to the saved case.

The benchmark is always labeled as controlled data. Live scans never fabricate
matches when provider credentials are unavailable.

The generated D1 migration is under `drizzle/`.

## Platform capability boundaries

- **YouTube:** keyword discovery through the official Data API.
- **Vimeo:** public catalog metadata search through the official API.
- **X:** recent public posts with video through the official recent-search API.
- **TikTok:** the official Display API lists videos belonging to an authorized
  creator; it does not provide general public-video search.
- **Instagram:** no general public Reels search endpoint is available for this
  cross-account workflow.

All returned candidates are metadata discoveries. Detecting crops, reframes,
speed changes, overlays, audio replacements, and partial clips requires a
separate media-processing system with legally obtained candidate video bytes,
frame/audio fingerprinting, and a verification queue.

## Identity

When hosted inside an authenticated OpenAI workspace, scan ownership uses the
forwarded `oai-authenticated-user-email` header. Local development uses an
anonymous local owner. Auth0 from the teammate prototype is intentionally not
included because the project runtime already provides an identity path and the
prototype had no working Auth0 configuration.

## Commands

```bash
npm run build
npm test
npm run lint
npm run db:generate
```

No deployment is required for local development.
