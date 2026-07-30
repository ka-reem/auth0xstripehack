import type {
  Platform,
  ProviderReport,
  ScanMatch,
} from "./scan-contract";
import { runtimeSecret } from "./scan-store";

type ConnectorResult = {
  report: ProviderReport;
  matches: ScanMatch[];
};

type YouTubeSearchItem = {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    channelTitle?: string;
    publishedAt?: string;
  };
};

type YouTubeVideoItem = {
  id?: string;
  contentDetails?: { duration?: string };
  statistics?: { viewCount?: string };
};

type VimeoVideo = {
  uri?: string;
  name?: string;
  link?: string;
  user?: { name?: string };
  created_time?: string;
  duration?: number;
  stats?: { plays?: number | null };
};

type XPost = {
  id?: string;
  text?: string;
  author_id?: string;
  created_at?: string;
  public_metrics?: {
    impression_count?: number;
  };
};

type XUser = {
  id?: string;
  username?: string;
  name?: string;
};

const restrictedProviders: ProviderReport[] = [
  {
    platform: "TikTok",
    status: "restricted",
    searched: false,
    candidates: 0,
    message:
      "TikTok's official Display API lists an authenticated creator's videos; it does not provide global public-video search.",
  },
  {
    platform: "Instagram",
    status: "restricted",
    searched: false,
    candidates: 0,
    message:
      "Instagram does not expose a general public Reels search API for cross-account matching.",
  },
];

async function fetchJson<T>(
  input: string,
  init: RequestInit = {},
  timeoutMs = 8_000,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(input, {
      ...init,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Provider request failed with ${response.status}.`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

function terms(value: string) {
  return new Set(
    value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((term) => term.length > 2),
  );
}

function titleScore(sourceTitle: string, candidateTitle: string) {
  const sourceTerms = terms(sourceTitle);
  const candidateTerms = terms(candidateTitle);
  if (!sourceTerms.size || !candidateTerms.size) return 20;

  let overlap = 0;
  for (const term of sourceTerms) {
    if (candidateTerms.has(term)) overlap += 1;
  }
  const union = new Set([...sourceTerms, ...candidateTerms]).size;
  return Math.max(20, Math.min(98, Math.round((overlap / union) * 100)));
}

function formatDuration(totalSeconds?: number | null) {
  if (!totalSeconds || totalSeconds < 0) return "—";
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
}

function parseIsoDuration(value?: string) {
  if (!value) return null;
  const match = value.match(
    /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/,
  );
  if (!match) return null;
  return (
    Number(match[1] || 0) * 86_400 +
    Number(match[2] || 0) * 3_600 +
    Number(match[3] || 0) * 60 +
    Number(match[4] || 0)
  );
}

function displayDate(value?: string) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function youtubeVideoId(value: string) {
  try {
    const url = new URL(value);
    if (url.hostname === "youtu.be") return url.pathname.split("/")[1] || null;
    if (url.hostname.endsWith("youtube.com")) {
      return (
        url.searchParams.get("v") ||
        url.pathname.match(/\/(?:shorts|embed)\/([^/?]+)/)?.[1] ||
        null
      );
    }
  } catch {
    return null;
  }
  return null;
}

function failedReport(platform: Platform, message: string): ConnectorResult {
  return {
    report: {
      platform,
      status: "failed",
      searched: true,
      candidates: 0,
      message,
    },
    matches: [],
  };
}

async function searchYouTube(
  query: string,
  sourceUrl: string,
): Promise<ConnectorResult> {
  const apiKey = runtimeSecret("YOUTUBE_API_KEY");
  if (!apiKey) {
    return {
      report: {
        platform: "YouTube",
        status: "credentials_required",
        searched: false,
        candidates: 0,
        message: "Add YOUTUBE_API_KEY to enable live YouTube keyword discovery.",
      },
      matches: [],
    };
  }

  try {
    const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
    searchUrl.search = new URLSearchParams({
      part: "snippet",
      type: "video",
      maxResults: "8",
      q: query,
      safeSearch: "moderate",
      key: apiKey,
    }).toString();
    const searchPayload = await fetchJson<{ items?: YouTubeSearchItem[] }>(
      searchUrl.toString(),
    );
    const sourceId = youtubeVideoId(sourceUrl);
    const searchItems = (searchPayload.items ?? []).filter(
      (item) => item.id?.videoId && item.id.videoId !== sourceId,
    );
    const ids = searchItems
      .map((item) => item.id?.videoId)
      .filter((id): id is string => Boolean(id));

    const detailById = new Map<string, YouTubeVideoItem>();
    if (ids.length) {
      const detailsUrl = new URL(
        "https://www.googleapis.com/youtube/v3/videos",
      );
      detailsUrl.search = new URLSearchParams({
        part: "statistics,contentDetails",
        id: ids.join(","),
        key: apiKey,
      }).toString();
      const detailPayload = await fetchJson<{ items?: YouTubeVideoItem[] }>(
        detailsUrl.toString(),
      );
      for (const detail of detailPayload.items ?? []) {
        if (detail.id) detailById.set(detail.id, detail);
      }
    }

    const matches = searchItems.map((item, index): ScanMatch => {
      const id = item.id?.videoId ?? `youtube-${index}`;
      const title = item.snippet?.title || "Untitled YouTube candidate";
      const detail = detailById.get(id);
      return {
        id: `youtube-${id}`,
        title,
        url: `https://www.youtube.com/watch?v=${id}`,
        platform: "YouTube",
        views: detail?.statistics?.viewCount
          ? Number(detail.statistics.viewCount)
          : null,
        confidence: titleScore(query, title),
        uploader: item.snippet?.channelTitle || "Unknown channel",
        duration: formatDuration(
          parseIsoDuration(detail?.contentDetails?.duration),
        ),
        published: displayDate(item.snippet?.publishedAt),
        signals: ["Title overlap", "YouTube keyword discovery"],
        transformations: [],
        visualSimilarity: null,
        audioSimilarity: null,
        temporalSimilarity: null,
        matchedDuration: null,
        tone: "amber",
        verification: "metadata-candidate",
      };
    });

    return {
      report: {
        platform: "YouTube",
        status: "completed",
        searched: true,
        candidates: matches.length,
        message: `YouTube keyword discovery returned ${matches.length} unverified candidates.`,
      },
      matches,
    };
  } catch (error) {
    return failedReport(
      "YouTube",
      error instanceof Error ? error.message : "YouTube search failed.",
    );
  }
}

async function searchVimeo(query: string): Promise<ConnectorResult> {
  const accessToken = runtimeSecret("VIMEO_ACCESS_TOKEN");
  if (!accessToken) {
    return {
      report: {
        platform: "Vimeo",
        status: "credentials_required",
        searched: false,
        candidates: 0,
        message: "Add VIMEO_ACCESS_TOKEN to enable live Vimeo discovery.",
      },
      matches: [],
    };
  }

  try {
    const searchUrl = new URL("https://api.vimeo.com/videos");
    searchUrl.search = new URLSearchParams({
      query,
      per_page: "8",
      sort: "relevant",
      direction: "desc",
      fields:
        "uri,name,link,user.name,created_time,duration,stats.plays",
    }).toString();
    const payload = await fetchJson<{ data?: VimeoVideo[] }>(
      searchUrl.toString(),
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.vimeo.*+json;version=3.4",
        },
      },
    );
    const matches = (payload.data ?? []).map((video, index): ScanMatch => {
      const numericId = video.uri?.split("/").filter(Boolean).pop();
      const title = video.name || "Untitled Vimeo candidate";
      return {
        id: `vimeo-${numericId || index}`,
        title,
        url: video.link || `https://vimeo.com/${numericId || ""}`,
        platform: "Vimeo",
        views:
          typeof video.stats?.plays === "number" ? video.stats.plays : null,
        confidence: titleScore(query, title),
        uploader: video.user?.name || "Unknown creator",
        duration: formatDuration(video.duration),
        published: displayDate(video.created_time),
        signals: ["Title overlap", "Vimeo public search"],
        transformations: [],
        visualSimilarity: null,
        audioSimilarity: null,
        temporalSimilarity: null,
        matchedDuration: null,
        tone: "blue",
        verification: "metadata-candidate",
      };
    });

    return {
      report: {
        platform: "Vimeo",
        status: "completed",
        searched: true,
        candidates: matches.length,
        message: `Vimeo discovery returned ${matches.length} unverified candidates.`,
      },
      matches,
    };
  } catch (error) {
    return failedReport(
      "Vimeo",
      error instanceof Error ? error.message : "Vimeo search failed.",
    );
  }
}

async function searchX(query: string): Promise<ConnectorResult> {
  const bearerToken = runtimeSecret("X_BEARER_TOKEN");
  if (!bearerToken) {
    return {
      report: {
        platform: "X",
        status: "credentials_required",
        searched: false,
        candidates: 0,
        message: "Add X_BEARER_TOKEN to search recent public posts with video.",
      },
      matches: [],
    };
  }

  try {
    const searchUrl = new URL("https://api.x.com/2/tweets/search/recent");
    const phrase = query.replaceAll('"', "").slice(0, 180);
    searchUrl.search = new URLSearchParams({
      query: `"${phrase}" has:videos -is:retweet`,
      max_results: "10",
      "tweet.fields": "created_at,public_metrics,author_id",
      expansions: "author_id",
      "user.fields": "name,username",
    }).toString();
    const payload = await fetchJson<{
      data?: XPost[];
      includes?: { users?: XUser[] };
    }>(searchUrl.toString(), {
      headers: { Authorization: `Bearer ${bearerToken}` },
    });
    const users = new Map(
      (payload.includes?.users ?? [])
        .filter((user) => user.id)
        .map((user) => [user.id as string, user]),
    );
    const matches = (payload.data ?? []).map((post, index): ScanMatch => {
      const author = post.author_id ? users.get(post.author_id) : undefined;
      const username = author?.username;
      const title = post.text?.slice(0, 140) || "Video post on X";
      return {
        id: `x-${post.id || index}`,
        title,
        url: post.id
          ? `https://x.com/${username || "i"}/status/${post.id}`
          : "https://x.com",
        platform: "X",
        views: post.public_metrics?.impression_count ?? null,
        confidence: titleScore(query, title),
        uploader: username ? `@${username}` : author?.name || "Unknown account",
        duration: "—",
        published: displayDate(post.created_at),
        signals: ["Text overlap", "Recent X video post"],
        transformations: [],
        visualSimilarity: null,
        audioSimilarity: null,
        temporalSimilarity: null,
        matchedDuration: null,
        tone: "blue",
        verification: "metadata-candidate",
      };
    });

    return {
      report: {
        platform: "X",
        status: "completed",
        searched: true,
        candidates: matches.length,
        message: `Recent X search returned ${matches.length} unverified candidates.`,
      },
      matches,
    };
  } catch (error) {
    return failedReport(
      "X",
      error instanceof Error ? error.message : "X search failed.",
    );
  }
}

export function initialProviderReports(): ProviderReport[] {
  return [
    {
      platform: "YouTube",
      status: "queued",
      searched: false,
      candidates: 0,
      message: "Waiting to start.",
    },
    restrictedProviders[0],
    restrictedProviders[1],
    {
      platform: "Vimeo",
      status: "queued",
      searched: false,
      candidates: 0,
      message: "Waiting to start.",
    },
    {
      platform: "X",
      status: "queued",
      searched: false,
      candidates: 0,
      message: "Waiting to start.",
    },
  ];
}

export async function runProviderDiscovery(
  query: string,
  sourceUrl: string,
) {
  const [youtube, vimeo, x] = await Promise.all([
    searchYouTube(query, sourceUrl),
    searchVimeo(query),
    searchX(query),
  ]);
  const matches = [...youtube.matches, ...vimeo.matches, ...x.matches].sort(
    (left, right) => right.confidence - left.confidence,
  );

  return {
    providers: [
      youtube.report,
      restrictedProviders[0],
      restrictedProviders[1],
      vimeo.report,
      x.report,
    ],
    matches,
  };
}
