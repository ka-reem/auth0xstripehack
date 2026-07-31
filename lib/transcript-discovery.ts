const STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "all",
  "also",
  "because",
  "before",
  "being",
  "could",
  "every",
  "from",
  "going",
  "have",
  "here",
  "into",
  "just",
  "know",
  "like",
  "more",
  "other",
  "really",
  "some",
  "than",
  "that",
  "their",
  "there",
  "these",
  "they",
  "this",
  "through",
  "very",
  "what",
  "when",
  "where",
  "which",
  "with",
  "would",
  "your",
]);

const CONVERSATIONAL_WORDS = new Set([
  "alright",
  "buddy",
  "jesus",
  "okay",
  "phone",
  "number",
  "right",
  "thing",
  "yeah",
  "yes",
]);

function cleanTranscript(value: string) {
  return value
    .replace(/\[(?:\d{1,2}:)?\d{1,2}:\d{2}(?:\.\d+)?\]/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function words(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}'\s-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function phraseScore(value: string) {
  const phraseWords = words(value);
  const distinctiveWords = phraseWords.filter(
    (word) =>
      word.length >= 4 &&
      !STOP_WORDS.has(word) &&
      !CONVERSATIONAL_WORDS.has(word),
  );
  const uniqueWords = new Set(distinctiveWords);
  const properNouns = value.match(/\b[A-Z][a-z]{2,}\b/g)?.length ?? 0;
  return (
    uniqueWords.size * 6 +
    distinctiveWords.reduce((sum, word) => sum + Math.min(word.length, 12), 0) +
    properNouns * 3 +
    (/\d/.test(value) ? 8 : 0)
  );
}

function sentenceCandidates(text: string) {
  const sentences = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim().replace(/^[-–—]\s*/, ""))
    .filter(Boolean);
  const candidates = sentences.filter((sentence) => {
    const count = words(sentence).length;
    return count >= 5 && count <= 22 && sentence.length >= 24;
  });

  for (let index = 0; index + 1 < sentences.length; index += 1) {
    const combined = `${sentences[index]} ${sentences[index + 1]}`.trim();
    const count = words(combined).length;
    if (count >= 7 && count <= 22) candidates.push(combined);
  }

  const transcriptWords = text.split(/\s+/).filter(Boolean);
  for (let index = 0; index + 7 < transcriptWords.length; index += 5) {
    candidates.push(transcriptWords.slice(index, index + 12).join(" "));
  }
  return candidates;
}

function usefulQueryWords(value: string) {
  return words(value).filter(
    (word) =>
      word.length >= 3 &&
      !STOP_WORDS.has(word) &&
      !CONVERSATIONAL_WORDS.has(word),
  );
}

function compactQuery(value: string, limit = 10) {
  const selected: string[] = [];
  for (const word of usefulQueryWords(value)) {
    if (!selected.includes(word)) selected.push(word);
    if (selected.length === limit) break;
  }
  return selected.join(" ");
}

function meaningfulTitle(value: string) {
  const normalized = value.trim();
  if (!normalized) return false;
  if (/^[A-Za-z0-9_-]{7,18}$/.test(normalized.replace(/\s+/g, ""))) {
    return false;
  }
  return usefulQueryWords(normalized).length >= 2;
}

export function buildDiscoveryQueries({
  title,
  description,
  author,
  phrases,
  transcript,
}: {
  title: string;
  description: string | null;
  author: string | null;
  phrases: string[];
  transcript: string | null;
}) {
  const candidates: string[] = [];
  const descriptionQuery = compactQuery(description || "", 9);
  const titleQuery = meaningfulTitle(title) ? compactQuery(title, 7) : "";
  const authorQuery = compactQuery(author || "", 3);

  if (descriptionQuery) {
    candidates.push(
      [descriptionQuery, authorQuery].filter(Boolean).join(" "),
      descriptionQuery,
    );
  }
  if (titleQuery) {
    candidates.push(
      [titleQuery, authorQuery].filter(Boolean).join(" "),
      titleQuery,
    );
  }

  for (const phrase of phrases.slice(0, 4)) {
    const clean = cleanTranscript(phrase).replaceAll('"', "").slice(0, 150);
    const relaxed = compactQuery(clean, 8);
    if (clean) candidates.push(`"${clean}"`);
    if (relaxed) candidates.push(relaxed);
  }

  const transcriptQuery = compactQuery(transcript || "", 11);
  if (transcriptQuery) candidates.push(transcriptQuery);
  if (authorQuery) candidates.push(authorQuery);

  const unique: string[] = [];
  for (const candidate of candidates) {
    const normalized = candidate.toLowerCase().replace(/\s+/g, " ").trim();
    if (
      !normalized ||
      unique.some((item) => item.toLowerCase() === normalized)
    ) {
      continue;
    }
    unique.push(candidate);
    if (unique.length === 8) break;
  }
  return unique;
}

export function transcriptFields(
  value: string,
  provider: "manual" | "faster-whisper",
  language: string | null = null,
) {
  const transcript = cleanTranscript(value).slice(0, 20_000);
  const ranked = sentenceCandidates(transcript)
    .map((phrase) => ({ phrase, score: phraseScore(phrase) }))
    .filter(({ score }) => score >= 20)
    .sort((left, right) => right.score - left.score);

  const discoveryPhrases: string[] = [];
  for (const candidate of ranked) {
    const normalized = candidate.phrase.toLowerCase();
    const overlaps = discoveryPhrases.some((existing) => {
      const existingWords = new Set(words(existing));
      const candidateWords = words(normalized);
      const shared = candidateWords.filter((word) => existingWords.has(word));
      return shared.length / Math.max(candidateWords.length, 1) > 0.7;
    });
    if (!overlaps) discoveryPhrases.push(candidate.phrase.slice(0, 180));
    if (discoveryPhrases.length === 5) break;
  }

  return {
    transcriptStatus:
      provider === "manual" ? ("provided" as const) : ("ready" as const),
    transcriptLanguage: language,
    transcriptExcerpt: transcript.slice(0, 640) || null,
    discoveryPhrases,
    discoveryQueries: [] as string[],
    transcriptProvider: provider,
    transcriptMessage:
      provider === "manual"
        ? "Transcript supplied by the rights holder."
        : "Transcript generated by the local Faster-Whisper worker.",
  };
}

export function emptyTranscriptFields() {
  return {
    transcriptStatus: "not_requested" as const,
    transcriptLanguage: null,
    transcriptExcerpt: null,
    discoveryPhrases: [] as string[],
    discoveryQueries: [] as string[],
    transcriptProvider: null,
    transcriptMessage: "No transcript has been supplied or generated.",
  };
}

export function discoverySeeds(title: string, phrases: string[]) {
  const seeds = [...phrases.slice(0, 5), title]
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set(seeds)].slice(0, 6);
}

export function textSimilarity(seeds: string[], candidate: string) {
  const normalizedCandidate = cleanTranscript(candidate).toLowerCase();
  let best = 0;

  for (const seed of seeds) {
    const normalizedSeed = cleanTranscript(seed).toLowerCase();
    if (
      normalizedSeed.length >= 20 &&
      normalizedCandidate.includes(normalizedSeed)
    ) {
      best = Math.max(best, 98);
      continue;
    }

    const seedTerms = new Set(
      words(normalizedSeed).filter((word) => word.length > 2),
    );
    const candidateTerms = new Set(
      words(normalizedCandidate).filter((word) => word.length > 2),
    );
    if (!seedTerms.size || !candidateTerms.size) continue;
    let overlap = 0;
    for (const term of seedTerms) {
      if (candidateTerms.has(term)) overlap += 1;
    }
    const recall = overlap / seedTerms.size;
    const precision = overlap / candidateTerms.size;
    const score =
      recall + precision > 0
        ? Math.round((2 * recall * precision * 100) / (recall + precision))
        : 0;
    best = Math.max(best, score);
  }

  return Math.max(20, Math.min(98, best || 20));
}
