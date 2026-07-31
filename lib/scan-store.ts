import { env } from "cloudflare:workers";
import type {
  ReviewDecision,
  ReviewStatus,
  ScanHistoryItem,
  ScanResponse,
} from "./scan-contract";
import { emptyTranscriptFields } from "./transcript-discovery";

type StoredScan = {
  report: ScanResponse;
  ownerKey: string;
};

type ScanRow = {
  id: string;
  owner_key: string;
  source: string;
  search_query: string;
  source_type: string;
  status: string;
  progress: number;
  created_at: number;
  updated_at: number;
  source_metadata: string;
  providers: string;
  matches: string;
  notice: string;
  error: string | null;
};

type ReviewRow = {
  match_id: string;
  decision: ReviewStatus;
  note: string;
  updated_at: number;
};

type RelayBindings = {
  DB?: D1Database;
  UPLOADS?: R2Bucket;
  YOUTUBE_API_KEY?: string;
  VIMEO_ACCESS_TOKEN?: string;
  X_BEARER_TOKEN?: string;
  REDDIT_CLIENT_ID?: string;
  REDDIT_CLIENT_SECRET?: string;
  REDDIT_USER_AGENT?: string;
  SEARXNG_URL?: string;
  SEARXNG_TOKEN?: string;
  SEARXNG_ENGINES?: string;
  GOOGLE_CSE_API_KEY?: string;
  GOOGLE_CSE_ID?: string;
  TRANSCRIPTION_WORKER_URL?: string;
  TRANSCRIPTION_WORKER_TOKEN?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_API_KEY?: string;
  APP_BASE_URL?: string;
};

const memoryScans = new Map<string, StoredScan>();
let schemaReady = false;

function bindings() {
  return env as unknown as RelayBindings;
}

function database() {
  return bindings().DB ?? null;
}

export function uploadBucket() {
  return bindings().UPLOADS ?? null;
}

export function runtimeSecret(
  name:
    | "YOUTUBE_API_KEY"
    | "VIMEO_ACCESS_TOKEN"
    | "X_BEARER_TOKEN"
    | "REDDIT_CLIENT_ID"
    | "REDDIT_CLIENT_SECRET"
    | "REDDIT_USER_AGENT"
    | "SEARXNG_URL"
    | "SEARXNG_TOKEN"
    | "SEARXNG_ENGINES"
    | "GOOGLE_CSE_API_KEY"
    | "GOOGLE_CSE_ID"
    | "TRANSCRIPTION_WORKER_URL"
    | "TRANSCRIPTION_WORKER_TOKEN"
    | "STRIPE_SECRET_KEY"
    | "STRIPE_API_KEY"
    | "APP_BASE_URL",
) {
  const bindingValue = bindings()[name];
  if (typeof bindingValue === "string" && bindingValue.trim()) {
    return bindingValue.trim();
  }

  const processValue =
    typeof process !== "undefined" ? process.env[name]?.trim() : undefined;
  return processValue || null;
}

async function ensureSchema(db: D1Database) {
  if (schemaReady) return;

  await db.batch([
    db.prepare(`
      CREATE TABLE IF NOT EXISTS scan_jobs (
        id TEXT PRIMARY KEY,
        owner_key TEXT NOT NULL,
        source TEXT NOT NULL,
        search_query TEXT NOT NULL,
        source_type TEXT NOT NULL,
        status TEXT NOT NULL,
        progress INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        source_metadata TEXT NOT NULL,
        providers TEXT NOT NULL,
        matches TEXT NOT NULL,
        notice TEXT NOT NULL,
        error TEXT
      )
    `),
    db.prepare(`
      CREATE INDEX IF NOT EXISTS scan_jobs_owner_created_idx
      ON scan_jobs (owner_key, created_at)
    `),
    db.prepare(`
      CREATE INDEX IF NOT EXISTS scan_jobs_status_idx
      ON scan_jobs (status)
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS scan_reviews (
        scan_id TEXT NOT NULL,
        owner_key TEXT NOT NULL,
        match_id TEXT NOT NULL,
        decision TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (scan_id, owner_key, match_id)
      )
    `),
    db.prepare(`
      CREATE INDEX IF NOT EXISTS scan_reviews_owner_scan_idx
      ON scan_reviews (owner_key, scan_id)
    `),
  ]);
  schemaReady = true;
}

function serialize(report: ScanResponse, ownerKey: string) {
  return [
    report.scanId,
    ownerKey,
    report.source,
    report.query,
    report.sourceType,
    report.status,
    report.progress,
    Date.parse(report.createdAt),
    Date.parse(report.updatedAt),
    JSON.stringify(report.sourceMetadata),
    JSON.stringify(report.providers),
    JSON.stringify(report.matches),
    report.notice,
    report.error,
  ] as const;
}

function deserialize(row: ScanRow): StoredScan {
  const storedMetadata = JSON.parse(
    row.source_metadata,
  ) as Partial<ScanResponse["sourceMetadata"]>;
  return {
    ownerKey: row.owner_key,
    report: {
      scanId: row.id,
      source: row.source,
      query: row.search_query,
      sourceType: row.source_type as ScanResponse["sourceType"],
      status: row.status as ScanResponse["status"],
      progress: row.progress,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      dataMode: row.source_type === "demo" ? "controlled-demo" : "live",
      sourceMetadata: {
        description: null,
        canonicalUrl: null,
        sourceDuration: null,
        ...emptyTranscriptFields(),
        ...storedMetadata,
      } as ScanResponse["sourceMetadata"],
      providers: JSON.parse(row.providers) as ScanResponse["providers"],
      matches: JSON.parse(row.matches) as ScanResponse["matches"],
      reviews: {},
      notice: row.notice,
      error: row.error,
    },
  };
}

export async function createScan(report: ScanResponse, ownerKey: string) {
  const db = database();
  if (!db) {
    memoryScans.set(report.scanId, { report, ownerKey });
    return report;
  }

  await ensureSchema(db);
  await db
    .prepare(`
      INSERT INTO scan_jobs (
        id, owner_key, source, search_query, source_type, status, progress, created_at,
        updated_at, source_metadata, providers, matches, notice, error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(...serialize(report, ownerKey))
    .run();
  return report;
}

export async function readScan(scanId: string, ownerKey: string) {
  const db = database();
  if (!db) {
    const stored = memoryScans.get(scanId);
    return stored?.ownerKey === ownerKey ? stored.report : null;
  }

  await ensureSchema(db);
  const row = await db
    .prepare("SELECT * FROM scan_jobs WHERE id = ? AND owner_key = ? LIMIT 1")
    .bind(scanId, ownerKey)
    .first<ScanRow>();
  if (!row) return null;
  const stored = deserialize(row).report;
  stored.reviews = await readReviews(scanId, ownerKey);
  return stored;
}

export async function updateScan(report: ScanResponse, ownerKey: string) {
  const db = database();
  if (!db) {
    memoryScans.set(report.scanId, { report, ownerKey });
    return report;
  }

  await ensureSchema(db);
  const values = serialize(report, ownerKey);
  await db
    .prepare(`
      UPDATE scan_jobs SET
        source = ?, search_query = ?, source_type = ?, status = ?, progress = ?,
        updated_at = ?, source_metadata = ?, providers = ?, matches = ?,
        notice = ?, error = ?
      WHERE id = ? AND owner_key = ?
    `)
    .bind(
      values[2],
      values[3],
      values[4],
      values[5],
      values[6],
      values[8],
      values[9],
      values[10],
      values[11],
      values[12],
      values[13],
      values[0],
      values[1],
    )
    .run();
  return report;
}

export function ownerKeyFromRequest(request: Request) {
  const authenticatedEmail = request.headers
    .get("oai-authenticated-user-email")
    ?.trim()
    .toLowerCase();
  return authenticatedEmail || "local-anonymous";
}

async function readReviews(scanId: string, ownerKey: string) {
  const db = database();
  if (!db) {
    return memoryScans.get(scanId)?.report.reviews ?? {};
  }

  await ensureSchema(db);
  const result = await db
    .prepare(
      `SELECT match_id, decision, note, updated_at
       FROM scan_reviews
       WHERE scan_id = ? AND owner_key = ?`,
    )
    .bind(scanId, ownerKey)
    .all<ReviewRow>();

  return Object.fromEntries(
    (result.results ?? []).map((row) => [
      row.match_id,
      {
        matchId: row.match_id,
        status: row.decision,
        note: row.note,
        updatedAt: new Date(row.updated_at).toISOString(),
      } satisfies ReviewDecision,
    ]),
  );
}

export async function setReviewDecision({
  scanId,
  ownerKey,
  matchId,
  status,
  note,
}: {
  scanId: string;
  ownerKey: string;
  matchId: string;
  status: ReviewStatus;
  note: string;
}) {
  const decision: ReviewDecision = {
    matchId,
    status,
    note,
    updatedAt: new Date().toISOString(),
  };
  const db = database();

  if (!db) {
    const stored = memoryScans.get(scanId);
    if (!stored || stored.ownerKey !== ownerKey) return null;
    stored.report = {
      ...stored.report,
      reviews: {
        ...stored.report.reviews,
        [matchId]: decision,
      },
      updatedAt: decision.updatedAt,
    };
    memoryScans.set(scanId, stored);
    return stored.report;
  }

  await ensureSchema(db);
  await db.batch([
    db
      .prepare(
        `INSERT INTO scan_reviews (
          scan_id, owner_key, match_id, decision, note, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(scan_id, owner_key, match_id)
        DO UPDATE SET
          decision = excluded.decision,
          note = excluded.note,
          updated_at = excluded.updated_at`,
      )
      .bind(
        scanId,
        ownerKey,
        matchId,
        status,
        note,
        Date.parse(decision.updatedAt),
      ),
    db
      .prepare(
        "UPDATE scan_jobs SET updated_at = ? WHERE id = ? AND owner_key = ?",
      )
      .bind(Date.parse(decision.updatedAt), scanId, ownerKey),
  ]);

  return readScan(scanId, ownerKey);
}

export async function listScans(ownerKey: string): Promise<ScanHistoryItem[]> {
  const db = database();
  if (!db) {
    return [...memoryScans.values()]
      .filter((stored) => stored.ownerKey === ownerKey)
      .sort(
        (left, right) =>
          Date.parse(right.report.createdAt) -
          Date.parse(left.report.createdAt),
      )
      .slice(0, 30)
      .map(({ report }) => ({
        scanId: report.scanId,
        query: report.query,
        sourceType: report.sourceType,
        status: report.status,
        dataMode: report.dataMode,
        candidateCount: report.matches.length,
        reviewedCount: Object.keys(report.reviews).length,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
      }));
  }

  await ensureSchema(db);
  const result = await db
    .prepare(
      `SELECT scan_jobs.*,
        (
          SELECT COUNT(*)
          FROM scan_reviews
          WHERE scan_reviews.scan_id = scan_jobs.id
            AND scan_reviews.owner_key = scan_jobs.owner_key
        ) AS reviewed_count
      FROM scan_jobs
      WHERE owner_key = ?
      ORDER BY created_at DESC
      LIMIT 30`,
    )
    .bind(ownerKey)
    .all<ScanRow & { reviewed_count: number }>();

  return (result.results ?? []).map((row) => ({
    scanId: row.id,
    query: row.search_query,
    sourceType: row.source_type as ScanHistoryItem["sourceType"],
    status: row.status as ScanHistoryItem["status"],
    dataMode: row.source_type === "demo" ? "controlled-demo" : "live",
    candidateCount: (
      JSON.parse(row.matches) as ScanResponse["matches"]
    ).length,
    reviewedCount: row.reviewed_count,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }));
}
