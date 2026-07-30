import { NextResponse } from "next/server";
import {
  createQueuedReport,
  metadataForDemo,
  metadataForLink,
  metadataForUpload,
  processScan,
} from "../../../lib/scan-engine";
import type {
  ScanRequest,
  ReviewStatus,
  ScanSourceType,
} from "../../../lib/scan-contract";
import {
  createScan,
  ownerKeyFromRequest,
  readScan,
  setReviewDecision,
} from "../../../lib/scan-store";
import {
  hasScanUnlock,
  paymentsEnabled,
  presentReport,
} from "../../../lib/payment";

function isSourceType(value: unknown): value is ScanSourceType {
  return value === "link" || value === "upload";
}

async function parseSubmission(request: Request, scanId: string) {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new Error("A video file is required.");
    }
    const transcriptValue = form.get("transcriptHint");
    const transcriptHint =
      typeof transcriptValue === "string" ? transcriptValue.trim() : "";
    if (transcriptHint.length > 20_000) {
      throw new Error("Transcript hints are limited to 20,000 characters.");
    }
    return {
      source: file.name,
      sourceType: "upload" as const,
      sourceMetadata: await metadataForUpload(file, scanId, transcriptHint),
    };
  }

  let body: Partial<ScanRequest>;
  try {
    body = (await request.json()) as Partial<ScanRequest>;
  } catch {
    throw new Error("Request body must be valid JSON.");
  }

  if (body.demo === true) {
    return {
      source: "relay-controlled-benchmark.mp4",
      sourceType: "demo" as const,
      sourceMetadata: metadataForDemo(),
    };
  }

  const source = typeof body.source === "string" ? body.source.trim() : "";
  const transcriptHint =
    typeof body.transcriptHint === "string" ? body.transcriptHint.trim() : "";
  if (!source) {
    throw new Error("A source video URL is required.");
  }
  if (!isSourceType(body.sourceType) || body.sourceType !== "link") {
    throw new Error("JSON scan requests must use sourceType link.");
  }
  if (transcriptHint.length > 20_000) {
    throw new Error("Transcript hints are limited to 20,000 characters.");
  }

  return {
    source,
    sourceType: "link" as const,
    sourceMetadata: await metadataForLink(source, transcriptHint),
  };
}

function isReviewStatus(value: unknown): value is ReviewStatus {
  return (
    value === "investigate" ||
    value === "authorized" ||
    value === "unauthorized" ||
    value === "dismissed"
  );
}

export async function POST(request: Request) {
  const scanId = crypto.randomUUID();
  const ownerKey = ownerKeyFromRequest(request);

  try {
    const submission = await parseSubmission(request, scanId);
    const report = createQueuedReport({ scanId, ...submission });
    await createScan(report, ownerKey);
    return NextResponse.json(report, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The scan could not be created.",
      },
      { status: 400 },
    );
  }
}

export async function GET(request: Request) {
  const scanId = new URL(request.url).searchParams.get("scan")?.trim() ?? "";
  if (!scanId) {
    return NextResponse.json(
      { error: "A scan id is required." },
      { status: 400 },
    );
  }

  const ownerKey = ownerKeyFromRequest(request);
  const report = await readScan(scanId, ownerKey);
  if (!report) {
    return NextResponse.json({ error: "Scan not found." }, { status: 404 });
  }

  const runningTooLong =
    report.status === "running" &&
    Date.now() - Date.parse(report.updatedAt) > 15_000;
  if (report.status === "queued" || runningTooLong) {
    const completed = await processScan(report, ownerKey);
    return NextResponse.json(await presentReport(completed, request));
  }

  return NextResponse.json(await presentReport(report, request));
}

export async function PATCH(request: Request) {
  const ownerKey = ownerKeyFromRequest(request);
  let body: {
    scanId?: unknown;
    matchId?: unknown;
    status?: unknown;
    note?: unknown;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const scanId = typeof body.scanId === "string" ? body.scanId.trim() : "";
  const matchId = typeof body.matchId === "string" ? body.matchId.trim() : "";
  const note = typeof body.note === "string" ? body.note.trim() : "";

  if (!scanId || !matchId || !isReviewStatus(body.status)) {
    return NextResponse.json(
      { error: "Scan, candidate, and review decision are required." },
      { status: 400 },
    );
  }
  if (note.length > 1_000) {
    return NextResponse.json(
      { error: "Review notes are limited to 1,000 characters." },
      { status: 400 },
    );
  }

  const report = await readScan(scanId, ownerKey);
  if (!report) {
    return NextResponse.json({ error: "Scan not found." }, { status: 404 });
  }
  if (!report.matches.some((match) => match.id === matchId)) {
    return NextResponse.json(
      { error: "Candidate not found in this scan." },
      { status: 404 },
    );
  }
  if (paymentsEnabled() && !(await hasScanUnlock(request, scanId))) {
    return NextResponse.json(
      { error: "Unlock this evidence report before recording a review." },
      { status: 402 },
    );
  }

  const updated = await setReviewDecision({
    scanId,
    ownerKey,
    matchId,
    status: body.status,
    note,
  });
  return NextResponse.json(await presentReport(updated, request));
}
