# Relay Rights

Relay helps a rights holder discover possible public reuploads of a source
video. A user can upload a video, paste an authorized public source URL, or add
known transcript lines. Relay then runs platform-specific discovery agents and
collects review candidates on a separate evidence page.

Candidates are not infringement verdicts. Transcript and metadata overlap are
discovery signals that still require visual/audio comparison and human review.

## What is implemented

- Private source uploads with SHA-256 integrity hashes.
- Persistent D1 scan jobs, reports, review decisions, and notes.
- Source transcription through a local Faster-Whisper worker.
- Public-source media retrieval through yt-dlp without cookies or access
  bypasses.
- Distinctive phrase extraction from supplied or generated transcripts.
- Optional source-frame web detection that returns exact pages containing full
  or partial visual matches.
- Parallel discovery agents for YouTube, TikTok, Instagram, Facebook, Vimeo, X,
  Reddit, Dailymotion, Twitch, and the broader web.
- Credential-free public-index fallbacks for every platform whose official API
  is unavailable, restricted, or not configured.
- Separate animated dashboard, multi-agent search sequence, results page, and
  case history.
- JSON, print, and share-link evidence export.
- Auth0 login through the official Next.js SDK.
- Server-verified Stripe Checkout with a signed, HTTP-only report unlock.
- A clearly labeled controlled benchmark for credential-free presentations.

## Local setup

Requirements:

- Node.js 22.13 or newer
- Docker Desktop with Linux containers

Install the app dependencies:

```bash
npm install
```

Create `.env` from `.env.example`. The included defaults connect the app to
the local Docker services:

```dotenv
SEARXNG_URL=http://localhost:8080
TRANSCRIPTION_WORKER_URL=http://localhost:8788
TRANSCRIPTION_WORKER_TOKEN=relay-local-development
APP_BASE_URL=http://localhost:3002
```

Start the local transcript and search services:

```bash
docker compose -f docker-compose.local.yml up -d --build
```

Start Relay:

```bash
npm run dev
```

The current workspace uses `http://localhost:3002`.

The first real transcription downloads the configured Whisper model into a
persistent Docker volume. `small` on CPU with `int8` computation is the default.
Change `WHISPER_MODEL` to `tiny` for a faster, lower-accuracy demo.

Stop the supporting services with:

```bash
docker compose -f docker-compose.local.yml down
```

## Optional provider credentials

Add any credentials you have to `.env`:

```dotenv
YOUTUBE_API_KEY=
VIMEO_ACCESS_TOKEN=
X_BEARER_TOKEN=
GOOGLE_VISION_API_KEY=
REDDIT_CLIENT_ID=
REDDIT_CLIENT_SECRET=
REDDIT_USER_AGENT=web:relay-rights-monitor:1.0
```

Without credentials, all ten agents still run. YouTube uses its public search
index through the local worker, while the other platforms use targeted SearXNG
queries. Official credentials replace those fallbacks where supported. Relay
never fabricates matches.

## Auth and payments

Auth0 uses a **Regular Web Application** because Relay has server-managed
sessions and route handlers. The local Auth0 application must allow:

- Callback: `http://localhost:3002/auth/callback`
- Logout: `http://localhost:3002`
- Web origin: `http://localhost:3002`

The SDK reads `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`,
`AUTH0_SECRET`, and `APP_BASE_URL`.

When `STRIPE_SECRET_KEY` is configured, Relay creates a $5 Checkout Session on
the server. The return route verifies the session directly with Stripe before
issuing a signed, HTTP-only cookie scoped to that scan. The scan API withholds
candidate details until that cookie is valid. When Stripe is not configured,
payments are disabled and local/judge workflows remain accessible.

SearXNG is used as a cross-platform web index and has JSON output enabled in
`services/search/settings.yml`. The local instance deliberately keeps only
Bing, Mojeek, and Mwmbl enabled to avoid broken default engines and reduce
rate-limit noise. Existing Google Programmable Search customers can instead
configure `GOOGLE_CSE_API_KEY` and `GOOGLE_CSE_ID`.

## Scan flow

1. `POST /api/scan` validates a public URL or multipart video upload.
2. Uploads are stored privately in the `UPLOADS` R2 bucket.
3. A queued scan record is written to the `DB` D1 database.
4. `GET /api/scan?scan=<id>` starts or retrieves the job.
5. Relay transcribes the source locally, unless the user supplied transcript
   text.
6. Relay extracts distinctive spoken phrases and combines them with the title.
7. Ten platform and web-index agents run in parallel. Where an official API is
   unavailable, a domain-targeted public-index fallback runs instead.
8. When Google Vision is configured, Relay extracts three source frames and
   requests pages containing full or partial visual matches.
9. Candidate URLs are normalized, deduplicated, scored, and persisted.
10. The user reviews candidates on `/results`, records a decision, and exports
   evidence.

## Platform boundaries

- **YouTube:** official Data API keyword discovery when configured, with a
  credential-free public YouTube search fallback through the local worker.
- **Vimeo:** official public catalog metadata search when configured, otherwise
  a targeted public-index search.
- **X:** official recent public-post search with video filters when configured,
  otherwise a targeted public-index search.
- **Reddit:** official OAuth search for public video/link posts when configured,
  otherwise a targeted public-index search.
- **TikTok:** general public-video search requires approved Research API access;
  Display API access is limited to an authorized creator's videos.
- **Instagram and Facebook:** general public cross-account video search is not
  available through their standard APIs. Relay searches pages visible to public
  search engines; Rights Manager remains Meta's native private-corpus workflow.
- **Dailymotion:** the public API is oriented toward authenticated catalog and
  account operations, so Relay uses a targeted public-index fallback.
- **Twitch:** Helix channel/category search does not search spoken transcripts,
  so Relay uses a targeted public-index fallback.
- **Web index:** transcript phrases are searched across public, indexed pages.
  Search-engine indexing is incomplete and does not prove ownership.

The local downloader accepts only allowlisted public video hosts, requires an
explicit authorization flag, downloads no playlists, uses no browser cookies,
and does not bypass logins, DRM, paywalls, or geographic restrictions.

## Presentation flow

1. Open `http://localhost:3002`.
2. Use **Run controlled evidence demo** for the deterministic judge experience.
3. Let the multi-agent search animation complete.
4. Review the visual, audio, temporal, and transformation signals.
5. Save a human decision and note.
6. Export or print the evidence report.
7. Open **Case history** to return to the saved case.

For a live transcript-led scan, paste a source URL or upload a file and expand
**Add transcript or memorable spoken lines** when automatic transcription is
not needed.

## Verification

```bash
npm run build
npm run lint
npm test
python -m py_compile services/transcription-worker/main.py
docker compose -f docker-compose.local.yml config --quiet
```

No public deployment is required. Relay is configured for localhost use.
