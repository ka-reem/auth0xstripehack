import type {
  Platform,
  ProviderReport,
  ScanMatch,
} from "./scan-contract";
import { runtimeSecret } from "./scan-store";
import {
  discoverySeeds,
  textSimilarity,
} from "./transcript-discovery";

type ConnectorResult = {
  report: ProviderReport;
  matches: ScanMatch[];
};

type YouTubeSearchItem = {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    description?: string;
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

type RedditPost = {
  id?: string;
  title?: string;
  selftext?: string;
  author?: string;
  permalink?: string;
  url?: string;
  created_utc?: number;
  ups?: number;
  is_video?: boolean;
  domain?: string;
  media?: { reddit_video?: { duration?: number } };
};

type SearxResult = {
  title?: string;
  url?: string;
  content?: string;
  engine?: string;
  publishedDate?: string;
};

type GoogleSearchItem = {
  title?: string;
  link?: string;
  snippet?: string;
  displayLink?: string;
};

type PublicYouTubeResult = {
  id?: string;
  title?: string;
  description?: string;
  url?: string;
  uploader?: string;
  duration?: number;
  timestamp?: number;
  view_count?: number;
  query?: string;
};

const publicIndexTargets: Partial<Record<Platform, string[]>> = {
  TikTok: ["tiktok.com"],
  Instagram: ["instagram.com/reel"],
  Facebook: ["facebook.com/reel", "fb.watch"],
  Vimeo: ["vimeo.com"],
  X: ["x.com", "twitter.com"],
  Reddit: ["reddit.com", "v.redd.it"],
  Dailymotion: ["dailymotion.com/video", "dai.ly"],
  Twitch: ["twitch.tv/videos", "twitch.tv/clip"],
};

const searxWaiters: Array<() => void> = [];
let activeSearxRequests = 0;

async function withSearxSlot<T>(request: () => Promise<T>) {
  if (activeSearxRequests >= 3) {
    await new Promise<void>((resolve) => searxWaiters.push(resolve));
  }
  activeSearxRequests += 1;
  try {
    return await request();
  } finally {
    activeSearxRequests -= 1;
    searxWaiters.shift()?.();
  }
}

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

function displayUnixDate(value?: number) {
  return value ? displayDate(new Date(value * 1_000).toISOString()) : "Date unavailable";
}

function platformForCandidate(value: string): Platform | null {
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
    if (host === "youtu.be" || host.endsWith("youtube.com")) return "YouTube";
    if (host.endsWith("tiktok.com")) return "TikTok";
    if (host.endsWith("instagram.com")) return "Instagram";
    if (host.endsWith("facebook.com") || host === "fb.watch") return "Facebook";
    if (host.endsWith("vimeo.com")) return "Vimeo";
    if (
      host === "x.com" ||
      host.endsWith(".x.com") ||
      host.endsWith("twitter.com")
    ) {
      return "X";
    }
    if (
      host.endsWith("reddit.com") ||
      host === "redd.it" ||
      host.endsWith(".redd.it")
    ) {
      return "Reddit";
    }
    if (host.endsWith("dailymotion.com") || host === "dai.ly") {
      return "Dailymotion";
    }
    if (host.endsWith("twitch.tv")) return "Twitch";
  } catch {
    return null;
  }
  return null;
}

function toneForPlatform(
  platform: Platform,
): ScanMatch["tone"] {
  if (platform === "YouTube" || platform === "Dailymotion") return "amber";
  if (platform === "TikTok" || platform === "X") return "cyan";
  if (platform === "Instagram" || platform === "Facebook") return "violet";
  return "blue";
}

function cleanWebTitle(value?: string) {
  return (value || "Untitled public video candidate")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
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

async function searchPublicPlatformIndex(
  platform: Exclude<Platform, "YouTube" | "Web">,
  queries: string[],
  sourceUrl: string,
  seeds: string[],
  transcriptLed: boolean,
): Promise<ConnectorResult> {
  const targets = publicIndexTargets[platform] ?? [];
  const unquoted =
    queries.find((value) => !value.trim().startsWith('"')) || queries[0] || "";
  const quoted =
    queries.find((value) => value.trim().startsWith('"')) || queries[1] || "";
  const siteFilter = targets.map((target) => `site:${target}`).join(" OR ");
  const targetedQueries = [unquoted, quoted]
    .filter(Boolean)
    .map((value) => `(${siteFilter}) ${value}`.trim())
    .filter(
      (value, index, values) =>
        values.findIndex((item) => item.toLowerCase() === value.toLowerCase()) ===
        index,
    )
    .slice(0, 2);

  const indexed = await searchWebIndex(
    targetedQueries,
    seeds,
    transcriptLed,
    sourceUrl,
    { addVideoVariants: false, maxQueries: 2 },
  );
  const matches = indexed.matches
    .filter((match) => match.platform === platform)
    .map((match) => ({
      ...match,
      id: `${platform.toLowerCase()}-public-${match.id}`,
      signals: [
        `${platform} public-index fallback`,
        ...match.signals.filter((signal) => !signal.includes("discovery")),
      ],
    }));

  return {
    report: {
      platform,
      status: indexed.report.status,
      searched: indexed.report.searched,
      candidates: matches.length,
      message: indexed.report.searched
        ? `${platform} public-index agent checked ${targetedQueries.length} targeted query variants and retained ${matches.length} plausible candidates. Coverage is limited to pages exposed to public search engines.`
        : `${platform} public-index agent could not run. ${indexed.report.message}`,
    },
    matches,
  };
}

async function searchYouTubePublicIndex(
  queries: string[],
  sourceUrl: string,
  seeds: string[],
): Promise<ConnectorResult> {
  const workerUrl = runtimeSecret("TRANSCRIPTION_WORKER_URL");
  if (!workerUrl) {
    return {
      report: {
        platform: "YouTube",
        status: "credentials_required",
        searched: false,
        candidates: 0,
        message:
          "Add YOUTUBE_API_KEY or run the local discovery worker to search YouTube.",
      },
      matches: [],
    };
  }

  try {
    const endpoint = new URL("/discover/youtube", workerUrl);
    const workerToken = runtimeSecret("TRANSCRIPTION_WORKER_TOKEN");
    const payload = await fetchJson<{
      queries?: string[];
      evaluated?: number;
      results?: PublicYouTubeResult[];
    }>(
      endpoint.toString(),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(workerToken
            ? { Authorization: `Bearer ${workerToken}` }
            : {}),
        },
        body: JSON.stringify({
          queries: queries.slice(0, 3),
          source_url: sourceUrl || null,
        }),
      },
      20_000,
    );
    const sourceId = youtubeVideoId(sourceUrl);
    const matches = (payload.results ?? [])
      .filter((result) => result.id && result.id !== sourceId && result.url)
      .map((result, index): ScanMatch => {
        const title = result.title || "Untitled YouTube candidate";
        const candidateText = `${title} ${result.description || ""} ${
          result.uploader || ""
        }`;
        return {
          id: `youtube-public-${result.id || index}`,
          title,
          url: result.url as string,
          platform: "YouTube",
          views:
            typeof result.view_count === "number" ? result.view_count : null,
          confidence: textSimilarity(seeds, candidateText),
          uploader: result.uploader || "Unknown channel",
          duration: formatDuration(result.duration),
          published: displayUnixDate(result.timestamp),
          signals: [
            "Public YouTube index",
            "Source metadata and transcript overlap",
          ],
          transformations: [],
          visualSimilarity: null,
          audioSimilarity: null,
          temporalSimilarity: null,
          matchedDuration: null,
          tone: "amber",
          verification: "metadata-candidate",
        };
      })
      .filter((match) => match.confidence >= 34)
      .slice(0, 10);

    return {
      report: {
        platform: "YouTube",
        status: "completed",
        searched: true,
        candidates: matches.length,
        message: `Public YouTube discovery evaluated ${
          payload.evaluated ?? 0
        } results across ${payload.queries?.length ?? 0} query variants and retained ${
          matches.length
        } plausible candidates.`,
      },
      matches,
    };
  } catch (error) {
    return failedReport(
      "YouTube",
      error instanceof Error
        ? `Public YouTube discovery failed: ${error.message}`
        : "Public YouTube discovery failed.",
    );
  }
}

async function searchYouTube(
  query: string,
  queries: string[],
  sourceUrl: string,
  seeds: string[],
  transcriptLed: boolean,
): Promise<ConnectorResult> {
  const apiKey = runtimeSecret("YOUTUBE_API_KEY");
  if (!apiKey) {
    return searchYouTubePublicIndex(queries, sourceUrl, seeds);
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
        confidence: transcriptLed
          ? textSimilarity(
              seeds,
              `${title} ${item.snippet?.description || ""}`,
            )
          : titleScore(query, title),
        uploader: item.snippet?.channelTitle || "Unknown channel",
        duration: formatDuration(
          parseIsoDuration(detail?.contentDetails?.duration),
        ),
        published: displayDate(item.snippet?.publishedAt),
        signals: transcriptLed
          ? ["Transcript phrase overlap", "YouTube keyword discovery"]
          : ["Title overlap", "YouTube keyword discovery"],
        transformations: [],
        visualSimilarity: null,
        audioSimilarity: null,
        temporalSimilarity: null,
        matchedDuration: null,
        tone: "amber",
        verification: transcriptLed
          ? "transcript-candidate"
          : "metadata-candidate",
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

async function searchVimeo(
  query: string,
  queries: string[],
  sourceUrl: string,
  seeds: string[],
  transcriptLed: boolean,
): Promise<ConnectorResult> {
  const accessToken = runtimeSecret("VIMEO_ACCESS_TOKEN");
  if (!accessToken) {
    return searchPublicPlatformIndex(
      "Vimeo",
      queries,
      sourceUrl,
      seeds,
      transcriptLed,
    );
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
        confidence: transcriptLed
          ? textSimilarity(seeds, title)
          : titleScore(query, title),
        uploader: video.user?.name || "Unknown creator",
        duration: formatDuration(video.duration),
        published: displayDate(video.created_time),
        signals: transcriptLed
          ? ["Transcript phrase overlap", "Vimeo public search"]
          : ["Title overlap", "Vimeo public search"],
        transformations: [],
        visualSimilarity: null,
        audioSimilarity: null,
        temporalSimilarity: null,
        matchedDuration: null,
        tone: "blue",
        verification: transcriptLed
          ? "transcript-candidate"
          : "metadata-candidate",
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

async function searchX(
  query: string,
  queries: string[],
  sourceUrl: string,
  seeds: string[],
  transcriptLed: boolean,
): Promise<ConnectorResult> {
  const bearerToken = runtimeSecret("X_BEARER_TOKEN");
  if (!bearerToken) {
    return searchPublicPlatformIndex(
      "X",
      queries,
      sourceUrl,
      seeds,
      transcriptLed,
    );
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
        confidence: transcriptLed
          ? textSimilarity(seeds, title)
          : titleScore(query, title),
        uploader: username ? `@${username}` : author?.name || "Unknown account",
        duration: "—",
        published: displayDate(post.created_at),
        signals: transcriptLed
          ? ["Transcript phrase overlap", "Recent X video post"]
          : ["Text overlap", "Recent X video post"],
        transformations: [],
        visualSimilarity: null,
        audioSimilarity: null,
        temporalSimilarity: null,
        matchedDuration: null,
        tone: "blue",
        verification: transcriptLed
          ? "transcript-candidate"
          : "metadata-candidate",
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

async function redditAccessToken(
  clientId: string,
  clientSecret: string,
  userAgent: string,
) {
  const response = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": userAgent,
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });
  if (!response.ok) {
    throw new Error(`Reddit authorization failed with ${response.status}.`);
  }
  const payload = (await response.json()) as { access_token?: string };
  if (!payload.access_token) throw new Error("Reddit did not return an access token.");
  return payload.access_token;
}

async function searchReddit(
  query: string,
  queries: string[],
  sourceUrl: string,
  seeds: string[],
  transcriptLed: boolean,
): Promise<ConnectorResult> {
  const clientId = runtimeSecret("REDDIT_CLIENT_ID");
  const clientSecret = runtimeSecret("REDDIT_CLIENT_SECRET");
  const userAgent =
    runtimeSecret("REDDIT_USER_AGENT") || "web:relay-rights-monitor:1.0";
  if (!clientId || !clientSecret) {
    return searchPublicPlatformIndex(
      "Reddit",
      queries,
      sourceUrl,
      seeds,
      transcriptLed,
    );
  }

  try {
    const token = await redditAccessToken(clientId, clientSecret, userAgent);
    const searchUrl = new URL("https://oauth.reddit.com/search");
    searchUrl.search = new URLSearchParams({
      q: transcriptLed ? `"${query.replaceAll('"', "").slice(0, 180)}"` : query,
      sort: "relevance",
      type: "link",
      limit: "15",
      raw_json: "1",
    }).toString();
    const payload = await fetchJson<{
      data?: { children?: Array<{ data?: RedditPost }> };
    }>(searchUrl.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": userAgent,
      },
    });
    const posts = (payload.data?.children ?? [])
      .map((child) => child.data)
      .filter((post): post is RedditPost => Boolean(post))
      .filter(
        (post) =>
          post.is_video ||
          Boolean(post.url && platformForCandidate(post.url)) ||
          post.domain === "v.redd.it",
      );
    const matches = posts.slice(0, 10).map((post, index): ScanMatch => {
      const title = post.title || "Reddit video candidate";
      const publicUrl = post.permalink
        ? `https://www.reddit.com${post.permalink}`
        : post.url || "https://www.reddit.com";
      return {
        id: `reddit-${post.id || index}`,
        title,
        url: publicUrl,
        platform: "Reddit",
        views: null,
        confidence: transcriptLed
          ? textSimilarity(seeds, `${title} ${post.selftext || ""}`)
          : titleScore(query, title),
        uploader: post.author ? `u/${post.author}` : "Unknown Reddit user",
        duration: formatDuration(post.media?.reddit_video?.duration),
        published: displayUnixDate(post.created_utc),
        signals: transcriptLed
          ? ["Transcript phrase overlap", "Reddit OAuth search"]
          : ["Title overlap", "Reddit OAuth search"],
        transformations: [],
        visualSimilarity: null,
        audioSimilarity: null,
        temporalSimilarity: null,
        matchedDuration: null,
        tone: "blue",
        verification: transcriptLed
          ? "transcript-candidate"
          : "metadata-candidate",
      };
    });

    return {
      report: {
        platform: "Reddit",
        status: "completed",
        searched: true,
        candidates: matches.length,
        message: `Reddit search returned ${matches.length} public video candidates.`,
      },
      matches,
    };
  } catch (error) {
    return failedReport(
      "Reddit",
      error instanceof Error ? error.message : "Reddit search failed.",
    );
  }
}

async function searchWebIndex(
  queries: string[],
  seeds: string[],
  transcriptLed: boolean,
  sourceUrl: string,
  options: {
    addVideoVariants?: boolean;
    maxQueries?: number;
  } = {},
): Promise<ConnectorResult> {
  const searxngUrl = runtimeSecret("SEARXNG_URL");
  const googleKey = runtimeSecret("GOOGLE_CSE_API_KEY");
  const googleCx = runtimeSecret("GOOGLE_CSE_ID");
  if (!searxngUrl && !(googleKey && googleCx)) {
    return {
      report: {
        platform: "Web",
        status: "credentials_required",
        searched: false,
        candidates: 0,
        message:
          "Run the included SearXNG service or add existing Google CSE credentials for cross-platform transcript discovery.",
      },
      matches: [],
    };
  }

  try {
    let sourceName = "SearXNG";
    let failedQueries = 0;
    let unresponsiveEngines = 0;
    const rawResults: Array<{
      title?: string;
      url?: string;
      content?: string;
      source?: string;
      published?: string;
    }> = [];
    const maxQueries = options.maxQueries ?? 6;
    const queryPlan = [
      ...queries.slice(0, maxQueries),
      ...(options.addVideoVariants === false
        ? []
        : queries
            .slice(0, 2)
            .filter((value) => !value.startsWith('"'))
            .map((value) => `${value} video`)),
    ]
      .map((value) => value.trim().slice(0, 180))
      .filter(
        (value, index, values) =>
          value && values.findIndex((item) => item.toLowerCase() === value.toLowerCase()) === index,
      )
      .slice(0, maxQueries);

    if (searxngUrl) {
      const token = runtimeSecret("SEARXNG_TOKEN");
      const engines =
        runtimeSecret("SEARXNG_ENGINES") || "bing,mojeek,mwmbl";
      const responses = await Promise.allSettled(
        queryPlan.map(async (searchQuery) => {
          const endpoint = new URL("/search", searxngUrl);
          endpoint.search = new URLSearchParams({
            q: searchQuery,
            format: "json",
            categories: "general",
            safesearch: "1",
            language: "en",
            engines,
          }).toString();
          return withSearxSlot(() =>
            fetchJson<{
              results?: SearxResult[];
              unresponsive_engines?: unknown[];
            }>(
              endpoint.toString(),
              {
                headers: token
                  ? { Authorization: `Bearer ${token}` }
                  : undefined,
              },
              12_000,
            ),
          );
        }),
      );
      for (const response of responses) {
        if (response.status === "rejected") {
          failedQueries += 1;
          continue;
        }
        unresponsiveEngines += response.value.unresponsive_engines?.length ?? 0;
        rawResults.push(
          ...(response.value.results ?? []).map((result) => ({
            title: result.title,
            url: result.url,
            content: result.content,
            source: result.engine,
            published: result.publishedDate,
          })),
        );
      }
    } else {
      sourceName = "Google Programmable Search";
      const responses = await Promise.allSettled(
        queryPlan.slice(0, 4).map(async (searchQuery) => {
          const endpoint = new URL(
            "https://customsearch.googleapis.com/customsearch/v1",
          );
          endpoint.search = new URLSearchParams({
            key: googleKey as string,
            cx: googleCx as string,
            q: searchQuery,
            num: "10",
            safe: "active",
          }).toString();
          return fetchJson<{ items?: GoogleSearchItem[] }>(endpoint.toString());
        }),
      );
      for (const response of responses) {
        if (response.status === "rejected") {
          failedQueries += 1;
          continue;
        }
        rawResults.push(
          ...(response.value.items ?? []).map((result) => ({
            title: result.title,
            url: result.link,
            content: result.snippet,
            source: result.displayLink,
          })),
        );
      }
    }

    if (!rawResults.length && failedQueries === queryPlan.length) {
      return failedReport(
        "Web",
        `${sourceName} failed every discovery query. No web coverage was available.`,
      );
    }

    const seen = new Set<string>();
    const matches: ScanMatch[] = [];
    const normalizedSource = sourceUrl.replace(/\/+$/, "");
    for (const result of rawResults) {
      if (
        !result.url ||
        seen.has(result.url) ||
        result.url.replace(/\/+$/, "") === normalizedSource
      ) {
        continue;
      }
      const platform = platformForCandidate(result.url);
      if (!platform) continue;
      seen.add(result.url);
      const title = cleanWebTitle(result.title);
      const confidence = transcriptLed
        ? textSimilarity(seeds, `${title} ${result.content || ""}`)
        : titleScore(queries[0] || "", `${title} ${result.content || ""}`);
      if (confidence < (transcriptLed ? 34 : 28)) continue;
      matches.push({
        id: `web-${platform.toLowerCase()}-${matches.length + 1}`,
        title,
        url: result.url,
        platform,
        views: null,
        confidence,
        uploader: result.source || new URL(result.url).hostname,
        duration: "—",
        published: displayDate(result.published),
        signals: transcriptLed
          ? ["Transcript phrase overlap", `${sourceName} discovery`]
          : ["Web text overlap", `${sourceName} discovery`],
        transformations: [],
        visualSimilarity: null,
        audioSimilarity: null,
        temporalSimilarity: null,
        matchedDuration: null,
        tone: toneForPlatform(platform),
        verification: transcriptLed
          ? "transcript-candidate"
          : "metadata-candidate",
      });
      if (matches.length === 12) break;
    }

    return {
      report: {
        platform: "Web",
        status: "completed",
        searched: true,
        candidates: matches.length,
        message: `${sourceName} ran ${queryPlan.length} query variants, evaluated ${rawResults.length} indexed pages, and retained ${matches.length} plausible video candidates.${
          unresponsiveEngines || failedQueries
            ? " Some backup-engine attempts were unavailable; results from responsive engines were still evaluated."
            : ""
        }`,
      },
      matches,
    };
  } catch (error) {
    return failedReport(
      "Web",
      error instanceof Error
        ? error.message
        : "Cross-platform web discovery failed.",
    );
  }
}

export function initialProviderReports(): ProviderReport[] {
  const queued = (platform: Platform): ProviderReport => ({
    platform,
    status: "queued",
    searched: false,
    candidates: 0,
    message: "Waiting to start.",
  });
  return [
    queued("YouTube"),
    queued("TikTok"),
    queued("Instagram"),
    queued("Facebook"),
    queued("Vimeo"),
    queued("X"),
    queued("Reddit"),
    queued("Dailymotion"),
    queued("Twitch"),
    queued("Web"),
  ];
}

export async function runProviderDiscovery({
  title,
  description,
  author,
  phrases,
  queries,
  sourceUrl,
}: {
  title: string;
  description: string | null;
  author: string | null;
  phrases: string[];
  queries: string[];
  sourceUrl: string;
}) {
  const sourceContext = [title, description, author].filter(Boolean).join(" ");
  const seeds = discoverySeeds(sourceContext, phrases);
  const transcriptLed = phrases.length > 0;
  const query = queries[0] || phrases[0] || title;
  const queryPlan = queries.length ? queries : [query];
  const [
    youtube,
    tiktok,
    instagram,
    facebook,
    vimeo,
    x,
    reddit,
    dailymotion,
    twitch,
    web,
  ] = await Promise.all([
    searchYouTube(query, queryPlan, sourceUrl, seeds, transcriptLed),
    searchPublicPlatformIndex(
      "TikTok",
      queryPlan,
      sourceUrl,
      seeds,
      transcriptLed,
    ),
    searchPublicPlatformIndex(
      "Instagram",
      queryPlan,
      sourceUrl,
      seeds,
      transcriptLed,
    ),
    searchPublicPlatformIndex(
      "Facebook",
      queryPlan,
      sourceUrl,
      seeds,
      transcriptLed,
    ),
    searchVimeo(query, queryPlan, sourceUrl, seeds, transcriptLed),
    searchX(query, queryPlan, sourceUrl, seeds, transcriptLed),
    searchReddit(query, queryPlan, sourceUrl, seeds, transcriptLed),
    searchPublicPlatformIndex(
      "Dailymotion",
      queryPlan,
      sourceUrl,
      seeds,
      transcriptLed,
    ),
    searchPublicPlatformIndex(
      "Twitch",
      queryPlan,
      sourceUrl,
      seeds,
      transcriptLed,
    ),
    searchWebIndex(queryPlan, seeds, transcriptLed, sourceUrl),
  ]);
  const matchByUrl = new Map<string, ScanMatch>();
  for (const match of [
    ...youtube.matches,
    ...tiktok.matches,
    ...instagram.matches,
    ...facebook.matches,
    ...vimeo.matches,
    ...x.matches,
    ...reddit.matches,
    ...dailymotion.matches,
    ...twitch.matches,
    ...web.matches,
  ]) {
    const existing = matchByUrl.get(match.url);
    if (!existing || match.confidence > existing.confidence) {
      matchByUrl.set(match.url, match);
    }
  }
  const matches = [...matchByUrl.values()].sort(
    (left, right) => right.confidence - left.confidence,
  );

  return {
    providers: [
      youtube.report,
      tiktok.report,
      instagram.report,
      facebook.report,
      vimeo.report,
      x.report,
      reddit.report,
      dailymotion.report,
      twitch.report,
      web.report,
    ],
    matches,
  };
}
