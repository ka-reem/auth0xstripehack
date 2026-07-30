export type ScanSourceType = "link" | "upload" | "demo";
export type ScanJobStatus = "queued" | "running" | "completed" | "failed";
export type Platform =
  | "YouTube"
  | "TikTok"
  | "Instagram"
  | "Vimeo"
  | "X";

export type ProviderStatus =
  | "queued"
  | "searching"
  | "completed"
  | "credentials_required"
  | "restricted"
  | "failed";

export type ScanRequest = {
  source: string;
  sourceType: Exclude<ScanSourceType, "demo">;
  demo?: boolean;
};

export type SourceMetadata = {
  title: string;
  platform: Platform | "Direct upload" | "Web";
  author: string | null;
  thumbnailUrl: string | null;
  integrityHash: string | null;
  objectKey: string | null;
};

export type ProviderReport = {
  platform: Platform;
  status: ProviderStatus;
  searched: boolean;
  candidates: number;
  message: string;
};

export type ScanMatch = {
  id: string;
  title: string;
  url: string;
  platform: Platform;
  views: number | null;
  confidence: number;
  uploader: string;
  duration: string;
  published: string;
  signals: string[];
  transformations: string[];
  visualSimilarity: number | null;
  audioSimilarity: number | null;
  temporalSimilarity: number | null;
  matchedDuration: string | null;
  tone: "amber" | "cyan" | "violet" | "blue";
  verification: "metadata-candidate" | "controlled-match";
};

export type ReviewStatus =
  | "investigate"
  | "authorized"
  | "unauthorized"
  | "dismissed";

export type ReviewDecision = {
  matchId: string;
  status: ReviewStatus;
  note: string;
  updatedAt: string;
};

export type ScanResponse = {
  scanId: string;
  source: string;
  query: string;
  sourceType: ScanSourceType;
  sourceMetadata: SourceMetadata;
  status: ScanJobStatus;
  progress: number;
  createdAt: string;
  updatedAt: string;
  dataMode: "live" | "controlled-demo";
  notice: string;
  providers: ProviderReport[];
  matches: ScanMatch[];
  reviews: Record<string, ReviewDecision>;
  error: string | null;
};

export type ScanHistoryItem = {
  scanId: string;
  query: string;
  sourceType: ScanSourceType;
  status: ScanJobStatus;
  dataMode: ScanResponse["dataMode"];
  candidateCount: number;
  reviewedCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ScanErrorResponse = {
  error: string;
};
