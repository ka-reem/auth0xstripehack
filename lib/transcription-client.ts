import type { SourceMetadata } from "./scan-contract";
import { runtimeSecret, uploadBucket } from "./scan-store";
import { transcriptFields } from "./transcript-discovery";

type TranscriptionResponse = {
  text?: string;
  language?: string;
  duration?: number;
  segments?: Array<{
    start: number;
    end: number;
    text: string;
  }>;
  source_title?: string;
  source_description?: string;
  source_uploader?: string;
  source_channel?: string;
  source_thumbnail?: string;
  source_duration?: number;
  source_url?: string;
  error?: string;
  detail?: string;
};

function enrichedMetadata(
  metadata: SourceMetadata,
  payload: TranscriptionResponse,
) {
  const title = payload.source_title?.trim();
  const author =
    payload.source_channel?.trim() || payload.source_uploader?.trim();
  return {
    ...metadata,
    title: title || metadata.title,
    author: author || metadata.author,
    description:
      payload.source_description?.trim() || metadata.description,
    thumbnailUrl:
      payload.source_thumbnail?.trim() || metadata.thumbnailUrl,
    canonicalUrl: payload.source_url?.trim() || metadata.canonicalUrl,
    sourceDuration:
      typeof payload.source_duration === "number"
        ? payload.source_duration
        : metadata.sourceDuration,
  };
}

function completedMetadata(
  metadata: SourceMetadata,
  payload: TranscriptionResponse,
) {
  if (!payload.text?.trim()) {
    throw new Error(payload.error || "The transcription worker returned no text.");
  }
  return {
    ...enrichedMetadata(metadata, payload),
    ...transcriptFields(
      payload.text,
      "faster-whisper",
      payload.language || null,
    ),
  };
}

function workerHeaders() {
  const workerToken = runtimeSecret("TRANSCRIPTION_WORKER_TOKEN");
  return workerToken
    ? { Authorization: `Bearer ${workerToken}` }
    : undefined;
}

async function inspectLinkedSource(
  metadata: SourceMetadata,
  sourceUrl: string,
) {
  const workerUrl = runtimeSecret("TRANSCRIPTION_WORKER_URL");
  if (!workerUrl) return metadata;
  try {
    const endpoint = new URL("/inspect-url", workerUrl);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...workerHeaders(),
      },
      body: JSON.stringify({ url: sourceUrl, authorized: true }),
      signal: AbortSignal.timeout(20_000),
    });
    const payload = (await response.json()) as TranscriptionResponse;
    return response.ok ? enrichedMetadata(metadata, payload) : metadata;
  } catch {
    return metadata;
  }
}

export async function transcribeLinkedSource(
  metadata: SourceMetadata,
  sourceUrl: string,
): Promise<SourceMetadata> {
  if (
    metadata.transcriptStatus === "provided" ||
    metadata.transcriptStatus === "ready"
  ) {
    return inspectLinkedSource(metadata, sourceUrl);
  }

  const workerUrl = runtimeSecret("TRANSCRIPTION_WORKER_URL");
  if (!workerUrl) {
    return {
      ...metadata,
      transcriptStatus: "unavailable",
      transcriptMessage:
        "Add TRANSCRIPTION_WORKER_URL to transcribe an authorized public source link.",
    };
  }

  try {
    const endpoint = new URL("/transcribe-url", workerUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...workerHeaders(),
        },
        body: JSON.stringify({ url: sourceUrl, authorized: true }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const payload = (await response.json()) as TranscriptionResponse;
    if (!response.ok) {
      throw new Error(
        payload.error ||
          payload.detail ||
          `Transcription failed with ${response.status}.`,
      );
    }
    return completedMetadata(metadata, payload);
  } catch (error) {
    return {
      ...metadata,
      transcriptStatus: "failed",
      transcriptMessage:
        error instanceof Error
          ? error.message
          : "The transcription worker could not process this source link.",
    };
  }
}

export async function transcribeStoredSource(
  metadata: SourceMetadata,
): Promise<SourceMetadata> {
  if (
    metadata.transcriptStatus === "provided" ||
    metadata.transcriptStatus === "ready" ||
    !metadata.objectKey
  ) {
    return metadata;
  }

  const workerUrl = runtimeSecret("TRANSCRIPTION_WORKER_URL");
  if (!workerUrl) {
    return {
      ...metadata,
      transcriptStatus: "unavailable",
      transcriptMessage:
        "Add TRANSCRIPTION_WORKER_URL to enable local Faster-Whisper transcription.",
    };
  }

  const bucket = uploadBucket();
  if (!bucket) {
    return {
      ...metadata,
      transcriptStatus: "failed",
      transcriptMessage: "The uploaded source could not be opened for transcription.",
    };
  }

  try {
    const stored = await bucket.get(metadata.objectKey);
    if (!stored) {
      throw new Error("Uploaded source was not found.");
    }

    const endpoint = new URL("/transcribe", workerUrl);
    const form = new FormData();
    form.set(
      "file",
      await stored.blob(),
      stored.customMetadata?.originalFilename || "source-video",
    );
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: workerHeaders(),
        body: form,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const payload = (await response.json()) as TranscriptionResponse;
    if (!response.ok) {
      throw new Error(
        payload.error ||
          payload.detail ||
          `Transcription failed with ${response.status}.`,
      );
    }

    return completedMetadata(metadata, payload);
  } catch (error) {
    return {
      ...metadata,
      transcriptStatus: "failed",
      transcriptMessage:
        error instanceof Error
          ? error.message
          : "The transcription worker could not process this source.",
    };
  }
}
