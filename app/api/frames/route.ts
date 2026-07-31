import { NextResponse } from "next/server";
import { runtimeSecret } from "../../../lib/scan-store";

type FrameWorkerResponse = {
  frames?: Array<{ timestamp?: number; content?: string }>;
  detail?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { source?: string };
    const source = body.source?.trim() ?? "";
    const sourceUrl = new URL(source);
    if (!["http:", "https:"].includes(sourceUrl.protocol)) {
      throw new Error("A public video URL is required.");
    }

    const workerUrl = runtimeSecret("TRANSCRIPTION_WORKER_URL");
    if (!workerUrl) {
      return NextResponse.json(
        { error: "The local frame worker is not running." },
        { status: 503 },
      );
    }
    const endpoint = new URL("/extract-frames", workerUrl);
    const workerToken = runtimeSecret("TRANSCRIPTION_WORKER_TOKEN");
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(workerToken
          ? { Authorization: `Bearer ${workerToken}` }
          : {}),
      },
      body: JSON.stringify({ url: source, authorized: true }),
      signal: AbortSignal.timeout(90_000),
    });
    const payload = (await response.json()) as FrameWorkerResponse;
    if (!response.ok) {
      throw new Error(payload.detail || "Source frames could not be extracted.");
    }

    return NextResponse.json({
      frames: (payload.frames ?? []).map((frame, index) => ({
        index: index + 1,
        timestamp: frame.timestamp ?? null,
        dataUrl: `data:image/jpeg;base64,${frame.content ?? ""}`,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Source frames could not be extracted.",
      },
      { status: 400 },
    );
  }
}
