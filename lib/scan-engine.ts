import {
  initialProviderReports,
  runProviderDiscovery,
} from "./provider-connectors";
import type {
  Platform,
  ProviderReport,
  ScanMatch,
  ScanResponse,
  ScanSourceType,
  SourceMetadata,
} from "./scan-contract";
import { updateScan, uploadBucket } from "./scan-store";
import {
  buildDiscoveryQueries,
  emptyTranscriptFields,
  transcriptFields,
} from "./transcript-discovery";
import {
  transcribeLinkedSource,
  transcribeStoredSource,
} from "./transcription-client";

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

const demoProviders: ProviderReport[] = [
  {
    platform: "YouTube",
    status: "completed",
    searched: true,
    candidates: 2,
    message: "Controlled benchmark searched: exact copy and cropped edit found.",
  },
  {
    platform: "TikTok",
    status: "completed",
    searched: true,
    candidates: 1,
    message: "Controlled benchmark searched: vertical reframe found.",
  },
  {
    platform: "Instagram",
    status: "completed",
    searched: true,
    candidates: 1,
    message: "Controlled benchmark searched: captioned excerpt found.",
  },
  {
    platform: "Vimeo",
    status: "completed",
    searched: true,
    candidates: 1,
    message: "Controlled benchmark searched: watermarked copy found.",
  },
  {
    platform: "X",
    status: "completed",
    searched: true,
    candidates: 1,
    message: "Controlled benchmark searched: shortened clip found.",
  },
];

const demoMatches: ScanMatch[] = [
  {
    id: "demo-youtube-exact",
    title: "Launch film — full mirror",
    url: "",
    platform: "YouTube",
    views: 184_200,
    confidence: 99,
    uploader: "@mirror_archive",
    duration: "00:48",
    published: "Jul 28, 2026",
    signals: ["Frame fingerprint", "Audio fingerprint", "Full-length alignment"],
    transformations: ["Exact visual copy", "Metadata removed"],
    visualSimilarity: 99,
    audioSimilarity: 99,
    temporalSimilarity: 100,
    matchedDuration: "00:00–00:48",
    tone: "amber",
    verification: "controlled-match",
  },
  {
    id: "demo-tiktok-vertical",
    title: "The launch moment everyone missed",
    url: "",
    platform: "TikTok",
    views: 91_400,
    confidence: 94,
    uploader: "@dailycuts",
    duration: "00:31",
    published: "Jul 29, 2026",
    signals: ["Frame fingerprint", "Temporal alignment", "Shared audio"],
    transformations: ["9:16 center crop", "Captions added"],
    visualSimilarity: 92,
    audioSimilarity: 97,
    temporalSimilarity: 94,
    matchedDuration: "00:07–00:38",
    tone: "cyan",
    verification: "controlled-match",
  },
  {
    id: "demo-instagram-caption",
    title: "A closer look at the reveal",
    url: "",
    platform: "Instagram",
    views: 63_800,
    confidence: 91,
    uploader: "@visualbrief",
    duration: "00:24",
    published: "Jul 29, 2026",
    signals: ["Frame fingerprint", "Partial-sequence match", "Audio overlap"],
    transformations: ["Caption overlay", "Intro removed"],
    visualSimilarity: 90,
    audioSimilarity: 93,
    temporalSimilarity: 91,
    matchedDuration: "00:12–00:36",
    tone: "violet",
    verification: "controlled-match",
  },
  {
    id: "demo-youtube-crop",
    title: "Product reveal (fan edit)",
    url: "",
    platform: "YouTube",
    views: 27_100,
    confidence: 88,
    uploader: "FrameShift Studio",
    duration: "00:44",
    published: "Jul 30, 2026",
    signals: ["Frame fingerprint", "Sequence alignment"],
    transformations: ["Edge crop", "Speed +4%", "New color grade"],
    visualSimilarity: 89,
    audioSimilarity: 84,
    temporalSimilarity: 91,
    matchedDuration: "00:02–00:46",
    tone: "blue",
    verification: "controlled-match",
  },
  {
    id: "demo-vimeo-watermark",
    title: "Launch film repost",
    url: "",
    platform: "Vimeo",
    views: 8_640,
    confidence: 86,
    uploader: "Motion Vault",
    duration: "00:48",
    published: "Jul 30, 2026",
    signals: ["Frame fingerprint", "Audio fingerprint"],
    transformations: ["Watermark added", "Re-encoded"],
    visualSimilarity: 84,
    audioSimilarity: 96,
    temporalSimilarity: 99,
    matchedDuration: "00:00–00:48",
    tone: "blue",
    verification: "controlled-match",
  },
  {
    id: "demo-x-short",
    title: "That final shot 🔥",
    url: "",
    platform: "X",
    views: 12_900,
    confidence: 83,
    uploader: "@trendwire",
    duration: "00:12",
    published: "Jul 30, 2026",
    signals: ["Partial-sequence match", "Shared audio"],
    transformations: ["12-second excerpt", "Audio normalized"],
    visualSimilarity: 85,
    audioSimilarity: 88,
    temporalSimilarity: 78,
    matchedDuration: "00:32–00:44",
    tone: "cyan",
    verification: "controlled-match",
  },
];

type OEmbedPayload = {
  title?: string;
  author_name?: string;
  thumbnail_url?: string;
};

function platformForUrl(url: URL): Platform | "Web" {
  const host = url.hostname.toLowerCase();
  if (host === "youtu.be" || host.endsWith("youtube.com")) return "YouTube";
  if (host.endsWith("tiktok.com")) return "TikTok";
  if (host.endsWith("instagram.com")) return "Instagram";
  if (host.endsWith("vimeo.com")) return "Vimeo";
  if (host === "x.com" || host.endsWith("twitter.com")) return "X";
  return "Web";
}

function fallbackTitle(url: URL) {
  const pathPart = decodeURIComponent(
    url.pathname.split("/").filter(Boolean).pop() || "",
  )
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/[-_]+/g, " ")
    .trim();
  return pathPart || url.hostname.replace(/^www\./, "");
}

async function fetchOEmbed(url: URL, platform: Platform | "Web") {
  let endpoint: URL | null = null;
  if (platform === "YouTube") {
    endpoint = new URL("https://www.youtube.com/oembed");
  } else if (platform === "Vimeo") {
    endpoint = new URL("https://vimeo.com/api/oembed.json");
  } else if (platform === "TikTok") {
    endpoint = new URL("https://www.tiktok.com/oembed");
  }
  if (!endpoint) return null;

  endpoint.searchParams.set("url", url.toString());
  if (platform === "YouTube") endpoint.searchParams.set("format", "json");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6_000);
  try {
    const response = await fetch(endpoint, { signal: controller.signal });
    if (!response.ok) return null;
    return (await response.json()) as OEmbedPayload;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function metadataForLink(
  source: string,
  transcriptHint = "",
): Promise<SourceMetadata> {
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    throw new Error("Enter a valid public video URL.");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Only HTTP and HTTPS video links are supported.");
  }
  if (source.length > 2_048) {
    throw new Error("The source URL is too long.");
  }

  const platform = platformForUrl(url);
  const embed = await fetchOEmbed(url, platform);
  const transcript = transcriptHint.trim()
    ? transcriptFields(transcriptHint, "manual")
    : emptyTranscriptFields();
  return {
    title: embed?.title?.trim() || fallbackTitle(url),
    platform,
    author: embed?.author_name?.trim() || null,
    description: null,
    thumbnailUrl: embed?.thumbnail_url || null,
    canonicalUrl: url.toString(),
    sourceDuration: null,
    integrityHash: null,
    objectKey: null,
    ...transcript,
  };
}

function safeFilename(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 140);
}

async function sha256(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function metadataForUpload(
  file: File,
  scanId: string,
  transcriptHint = "",
) {
  if (!file.type.startsWith("video/")) {
    throw new Error("The uploaded file must be a video.");
  }
  if (!file.size) {
    throw new Error("The uploaded video is empty.");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("Video uploads are limited to 100 MB.");
  }

  const bucket = uploadBucket();
  if (!bucket) {
    throw new Error("Video object storage is not available.");
  }

  const integrityHash = await sha256(file);
  const filename = safeFilename(file.name || "source-video");
  const objectKey = `sources/${scanId}/${filename}`;
  await bucket.put(objectKey, file.stream(), {
    httpMetadata: { contentType: file.type },
    customMetadata: {
      sha256: integrityHash,
      originalFilename: file.name,
    },
  });

  const title =
    file.name
      .replace(/\.[a-z0-9]{2,5}$/i, "")
      .replace(/[-_]+/g, " ")
      .trim() || "Uploaded source video";

  const metadata: SourceMetadata = {
    title,
    platform: "Direct upload",
    author: null,
    description: null,
    thumbnailUrl: null,
    canonicalUrl: null,
    sourceDuration: null,
    integrityHash,
    objectKey,
    ...(transcriptHint.trim()
      ? transcriptFields(transcriptHint, "manual")
      : emptyTranscriptFields()),
  };
  return metadata;
}

export function metadataForDemo(): SourceMetadata {
  return {
    title: "Relay launch film — controlled benchmark",
    platform: "Direct upload",
    author: "Relay benchmark suite",
    description:
      "A controlled Relay launch-film specimen used to validate the evidence workflow.",
    thumbnailUrl: null,
    canonicalUrl: null,
    sourceDuration: 48,
    integrityHash:
      "4f8c2f6c85ae589ad86a724b48d8d9dc7244c4c64b2da8c1fa2b7e832cd0f61a",
    objectKey: null,
    ...transcriptFields(
      "This launch film follows a signal leaving the original frame and traveling across every public screen. The final reveal asks creators to protect the work without losing sight of how culture moves.",
      "manual",
      "en",
    ),
  };
}

export function createQueuedReport({
  scanId,
  source,
  sourceType,
  sourceMetadata,
}: {
  scanId: string;
  source: string;
  sourceType: ScanSourceType;
  sourceMetadata: SourceMetadata;
}): ScanResponse {
  const now = new Date().toISOString();
  return {
    scanId,
    source,
    query: sourceMetadata.title,
    sourceType,
    sourceMetadata,
    status: "queued",
    progress: 8,
    createdAt: now,
    updatedAt: now,
    dataMode: sourceType === "demo" ? "controlled-demo" : "live",
    notice: "The source is registered and provider agents are queued.",
    providers: initialProviderReports(),
    matches: [],
    reviews: {},
    error: null,
  };
}

export async function processScan(report: ScanResponse, ownerKey: string) {
  const running: ScanResponse = {
    ...report,
    status: "running",
    progress: 35,
    updatedAt: new Date().toISOString(),
    providers: report.providers.map((provider) =>
      provider.status === "queued"
        ? {
            ...provider,
            status: "searching",
            message: "Searching the configured provider discovery channel.",
          }
        : provider,
    ),
    notice: "Provider and transcript discovery agents are running in parallel.",
  };
  await updateScan(running, ownerKey);

  try {
    let active = running;
    if (running.sourceType === "upload" || running.sourceType === "link") {
      const processedMetadata =
        running.sourceType === "upload"
          ? await transcribeStoredSource(running.sourceMetadata)
          : await transcribeLinkedSource(running.sourceMetadata, running.source);
      const sourceMetadata = {
        ...processedMetadata,
        discoveryQueries: buildDiscoveryQueries({
          title: processedMetadata.title,
          description: processedMetadata.description,
          author: processedMetadata.author,
          phrases: processedMetadata.discoveryPhrases,
          transcript: processedMetadata.transcriptExcerpt,
        }),
      };
      active = {
        ...running,
        sourceMetadata,
        query:
          sourceMetadata.discoveryQueries[0] ||
          sourceMetadata.discoveryPhrases[0] ||
          sourceMetadata.title,
        progress: 58,
        updatedAt: new Date().toISOString(),
        notice:
          sourceMetadata.transcriptStatus === "ready"
            ? "The source was transcribed locally. Distinctive spoken phrases are driving discovery."
            : sourceMetadata.transcriptMessage,
      };
      await updateScan(active, ownerKey);
    }

    const discovery =
      active.sourceType === "demo"
        ? { providers: demoProviders, matches: demoMatches }
        : await runProviderDiscovery({
            title: active.sourceMetadata.title,
            description: active.sourceMetadata.description,
            author: active.sourceMetadata.author,
            phrases: active.sourceMetadata.discoveryPhrases,
            queries: active.sourceMetadata.discoveryQueries,
            sourceUrl: active.sourceType === "link" ? active.source : "",
          });
    const searchedProviders = discovery.providers.filter(
      (provider) => provider.searched,
    ).length;
    const completed: ScanResponse = {
      ...active,
      status: "completed",
      progress: 100,
      updatedAt: new Date().toISOString(),
      providers: discovery.providers,
      matches: discovery.matches,
      notice:
        active.sourceType === "demo"
          ? "Controlled benchmark complete. These six labeled specimens demonstrate the evidence workflow; they are not claims about live public posts."
          : searchedProviders > 0
            ? discovery.matches.length
              ? `${searchedProviders} discovery channels ran and returned ${discovery.matches.length} candidates for visual verification.`
              : `The source was processed and ${searchedProviders} available discovery channel${
                  searchedProviders === 1 ? "" : "s"
                } found no indexed match. Restricted and credential-gated platforms were not searched.`
            : "No live provider credentials are configured. The job completed without fabricating matches.",
      error: null,
    };
    return updateScan(completed, ownerKey);
  } catch (error) {
    const failed: ScanResponse = {
      ...running,
      status: "failed",
      progress: 100,
      updatedAt: new Date().toISOString(),
      notice: "The scan stopped before provider discovery completed.",
      error: error instanceof Error ? error.message : "The scan failed.",
    };
    return updateScan(failed, ownerKey);
  }
}
