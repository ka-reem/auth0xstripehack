"use client";
/* eslint-disable @next/next/no-html-link-for-pages */

import { useEffect, useMemo, useState } from "react";
import type {
  Platform,
  ReviewStatus,
  ScanErrorResponse,
  ScanResponse,
} from "../../lib/scan-contract";

const platformMarks: Record<Platform, string> = {
  YouTube: "YT",
  TikTok: "TT",
  Instagram: "IG",
  Facebook: "FB",
  Vimeo: "VI",
  X: "X",
  Reddit: "RD",
  Dailymotion: "DM",
  Twitch: "TW",
  Web: "WB",
};

const reviewLabels: Record<ReviewStatus, string> = {
  investigate: "Needs investigation",
  authorized: "Authorized use",
  unauthorized: "Likely unauthorized",
  dismissed: "Dismissed",
};

function BrandMark() {
  return (
    <span className="brand-mark">
      <span />
    </span>
  );
}

function isScanResponse(value: unknown): value is ScanResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ScanResponse>;
  return (
    typeof candidate.scanId === "string" &&
    typeof candidate.source === "string" &&
    typeof candidate.query === "string" &&
    typeof candidate.status === "string" &&
    Array.isArray(candidate.providers) &&
    Array.isArray(candidate.matches)
  );
}

function compactNumber(value: number) {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export default function ResultsPage() {
  const [report, setReport] = useState<ScanResponse | null>(null);
  const [loadError, setLoadError] = useState("");
  const [reviewSaving, setReviewSaving] = useState("");
  const [copied, setCopied] = useState(false);
  const [checkoutStarting, setCheckoutStarting] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadReport() {
      const scanId =
        new URLSearchParams(window.location.search).get("scan")?.trim() ?? "";
      if (!scanId) {
        setLoadError("This report link is incomplete. Start a new scan to continue.");
        return;
      }

      for (let attempt = 0; attempt < 40 && !cancelled; attempt += 1) {
        try {
          const params = new URLSearchParams({ scan: scanId });
          const response = await fetch(`/api/scan?${params.toString()}`, {
            cache: "no-store",
          });
          const payload = (await response.json()) as
            | ScanResponse
            | ScanErrorResponse;

          if (!response.ok || !isScanResponse(payload)) {
            throw new Error(
              "error" in payload && typeof payload.error === "string"
                ? payload.error
                : "The scan report could not be loaded.",
            );
          }
          if (payload.status === "failed") {
            throw new Error(payload.error || "The scan failed.");
          }
          if (!cancelled) setReport(payload);
          if (payload.status === "completed") return;
          await wait(650);
        } catch (requestError) {
          if (!cancelled) {
            setLoadError(
              requestError instanceof Error
                ? requestError.message
                : "The scan report could not be loaded.",
            );
          }
          return;
        }
      }

      if (!cancelled) {
        setLoadError("The scan is still running. Refresh this report shortly.");
      }
    }

    void loadReport();
    return () => {
      cancelled = true;
    };
  }, []);

  const metrics = useMemo(() => {
    const matches = report?.matches ?? [];
    return {
      combinedReach: matches.reduce(
        (sum, match) => sum + (match.views ?? 0),
        0,
      ),
      liveConnectors:
        report?.providers.filter((provider) => provider.searched).length ?? 0,
      reviewedCount: Object.keys(report?.reviews ?? {}).length,
      unauthorizedCount: Object.values(report?.reviews ?? {}).filter(
        (decision) => decision.status === "unauthorized",
      ).length,
    };
  }, [report]);

  async function saveReview(
    matchId: string,
    status: ReviewStatus,
    note = "",
  ) {
    if (!report) return;
    setReviewSaving(matchId);
    try {
      const response = await fetch("/api/scan", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scanId: report.scanId,
          matchId,
          status,
          note,
        }),
      });
      const payload = (await response.json()) as
        | ScanResponse
        | ScanErrorResponse;
      if (!response.ok || !isScanResponse(payload)) {
        throw new Error(
          "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "The review could not be saved.",
        );
      }
      setReport(payload);
    } catch (requestError) {
      setLoadError(
        requestError instanceof Error
          ? requestError.message
          : "The review could not be saved.",
      );
    } finally {
      setReviewSaving("");
    }
  }

  function exportEvidence() {
    if (!report) return;
    const blob = new Blob(
      [
        JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            disclaimer:
              "Discovery evidence for human review. This report is not a legal determination of infringement.",
            report,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `relay-evidence-${report.scanId.slice(0, 8)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function copyReportLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_800);
  }

  function moveCursor(event: React.PointerEvent<HTMLElement>) {
    event.currentTarget.style.setProperty("--cursor-x", `${event.clientX}px`);
    event.currentTarget.style.setProperty("--cursor-y", `${event.clientY}px`);
  }

  const isReady = report?.status === "completed";
  const isDemo = report?.dataMode === "controlled-demo";
  const candidateCount =
    report?.payment?.candidateCount ?? report?.matches.length ?? 0;
  const reportLocked = Boolean(
    report?.payment?.enabled && !report.payment.unlocked && candidateCount,
  );

  async function startUnlock() {
    if (!report || checkoutStarting) return;
    setCheckoutStarting(true);
    setCheckoutError("");
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scanId: report.scanId }),
      });
      const payload = (await response.json()) as {
        url?: string;
        error?: string;
      };
      if (!response.ok || !payload.url) {
        throw new Error(payload.error || "Stripe Checkout could not be started.");
      }
      window.location.assign(payload.url);
    } catch (error) {
      setCheckoutError(
        error instanceof Error
          ? error.message
          : "Stripe Checkout could not be started.",
      );
      setCheckoutStarting(false);
    }
  }

  return (
    <main className="results-page dashboard-ready" onPointerMove={moveCursor}>
      <div className="cursor-light" aria-hidden="true" />
      <div className="noise" aria-hidden="true" />
      <div className="aurora aurora-one" aria-hidden="true" />
      <div className="aurora aurora-two" aria-hidden="true" />

      <nav className="site-nav results-nav" aria-label="Results navigation">
        <a className="brand" href="/" aria-label="Relay home">
          <BrandMark />
          <span>RELAY</span>
        </a>
        <p className="nav-note">
          <i />
          RIGHTS MONITOR / REPORT
        </p>
        <a className="nav-link" href="/">
          New scan <span aria-hidden="true">↗</span>
        </a>
      </nav>

      {!report || !isReady ? (
        <section className="report-state" aria-live="polite">
          <span>{loadError ? "REPORT UNAVAILABLE" : "PROVIDER JOB ACTIVE"}</span>
          <h1>
            {loadError ||
              (report
                ? `Searching official sources · ${report.progress}%`
                : "Loading scan job…")}
          </h1>
          <p>
            {loadError
              ? "Return to Relay and submit the source again."
              : "The report is stored server-side and will appear when provider agents finish."}
          </p>
          {loadError && (
            <a className="report-action" href="/">
              Start a new scan <span aria-hidden="true">↗</span>
            </a>
          )}
        </section>
      ) : (
        <section className="results-section standalone-results">
          <div className="results-context">
            <span>SCAN / {report.scanId.slice(0, 13).toUpperCase()}</span>
            <p>
              Source <i aria-hidden="true">→</i> <strong>{report.source}</strong>
            </p>
          </div>

          <div className="results-header">
            <div>
              <div className="eyebrow">
                <span className="live-dot" />
                PERSISTENT SCAN REPORT
              </div>
              <h1>
                {candidateCount
                  ? "Candidate reuploads found"
                  : "Provider scan complete"}
              </h1>
              <p>
                Search query <span>{report.query}</span>
              </p>
            </div>
            <div className="report-actions">
              <button
                type="button"
                onClick={exportEvidence}
                disabled={reportLocked}
              >
                Export evidence
              </button>
              <button
                type="button"
                onClick={copyReportLink}
                disabled={reportLocked}
              >
                {copied ? "Link copied" : "Copy report link"}
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                disabled={reportLocked}
              >
                Print report
              </button>
            </div>
          </div>

          <div className={`prototype-disclosure ${isDemo ? "demo-disclosure" : ""}`}>
            <span>
              {isDemo
                ? "CONTROLLED DEMONSTRATION"
                : metrics.liveConnectors
                  ? "LIVE METADATA SEARCH"
                  : "CONNECTORS PAUSED"}
            </span>
            <p>{report.notice}</p>
          </div>

          <div
            className={`transcript-intelligence transcript-${report.sourceMetadata.transcriptStatus}`}
          >
            <div>
              <span>TRANSCRIPT DISCOVERY</span>
              <strong>
                {report.sourceMetadata.transcriptStatus.replaceAll("_", " ")}
              </strong>
            </div>
            <p>{report.sourceMetadata.transcriptMessage}</p>
            {report.sourceMetadata.transcriptExcerpt && (
              <blockquote>
                “{report.sourceMetadata.transcriptExcerpt}”
              </blockquote>
            )}
            {report.sourceMetadata.discoveryPhrases.length > 0 && (
              <div className="discovery-phrases">
                {report.sourceMetadata.discoveryPhrases.map((phrase) => (
                  <span key={phrase}>{phrase}</span>
                ))}
              </div>
            )}
          </div>

          <div className="rights-summary">
            <article>
              <span>CANDIDATE POSTS</span>
              <strong>{candidateCount.toString().padStart(2, "0")}</strong>
              <small>
                {isDemo ? "controlled benchmark set" : "returned by official APIs"}
              </small>
            </article>
            <article>
              <span>VISIBLE REACH</span>
              <strong>{compactNumber(metrics.combinedReach)}</strong>
              <small>
                {isDemo ? "synthetic specimen reach" : "where providers expose views"}
              </small>
            </article>
            <article>
              <span>{isDemo ? "DEMO AGENTS" : "LIVE CONNECTORS"}</span>
              <strong>{metrics.liveConnectors.toString().padStart(2, "0")}</strong>
              <small>
                {isDemo
                  ? "controlled platform nodes"
                  : "configured discovery agents"}
              </small>
            </article>
            <article>
              <span>REVIEWED</span>
              <strong>{metrics.reviewedCount.toString().padStart(2, "0")}</strong>
              <small>
                {metrics.unauthorizedCount
                  ? `${metrics.unauthorizedCount} likely unauthorized`
                  : "persistent case decisions"}
              </small>
            </article>
          </div>

          <div className="provider-status-grid" aria-label="Provider status">
            {report.providers.map((provider) => (
              <article
                className={`provider-status provider-${provider.status}`}
                key={provider.platform}
              >
                <div>
                  <i>{platformMarks[provider.platform]}</i>
                  <span>{provider.platform}</span>
                </div>
                <strong>{provider.status.replaceAll("_", " ")}</strong>
                <p>{provider.message}</p>
              </article>
            ))}
          </div>

          <div className="review-principle">
            <i aria-hidden="true">!</i>
            <p>
              <strong>
                {isDemo
                  ? "These are labeled benchmark specimens—not live public posts."
                  : "These are discovery leads—not verified visual matches."}
              </strong>
              {" "}
              {isDemo
                ? "Use them to demonstrate how Relay explains transformations and records a human decision."
                : "Review the actual footage, permissions, licensing, and context before deciding whether a post is an unauthorized reupload."}
            </p>
          </div>

          <div className="report-section-label">
            <span>04 / CANDIDATE EVIDENCE</span>
            <p>
              {isDemo
                ? "Ranked by multimodal similarity"
                : "Ranked by metadata overlap"}
            </p>
          </div>

          {reportLocked ? (
            <div
              className="secure-unlock"
              style={{
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 16,
                padding: "30px 32px",
                margin: "4px 0 20px",
                background: "rgba(255,255,255,0.04)",
                display: "flex",
                flexWrap: "wrap",
                gap: 14,
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div>
                <strong style={{ fontSize: 24 }}>
                  Unlock all {candidateCount} results
                </strong>
                <p style={{ margin: "7px 0 0", opacity: 0.7, fontSize: 16 }}>
                  Stripe verifies the payment before Relay releases evidence.
                </p>
                {checkoutError && (
                  <p role="alert" style={{ margin: "9px 0 0", color: "#ffb4a4" }}>
                    {checkoutError}
                  </p>
                )}
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => void startUnlock()}
                  disabled={checkoutStarting}
                  style={{
                    padding: "14px 24px",
                    borderRadius: 10,
                    border: "none",
                    background: "#fff",
                    color: "#000",
                    fontWeight: 700,
                    fontSize: 16,
                    cursor: checkoutStarting ? "wait" : "pointer",
                  }}
                >
                  {checkoutStarting ? "Opening secure checkout…" : "Unlock results — $5"}
                </button>
                <button
                  type="button"
                  disabled
                  title="Coming soon"
                  style={{
                    padding: "11px 20px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.2)",
                    background: "transparent",
                    color: "rgba(255,255,255,0.4)",
                    cursor: "not-allowed",
                  }}
                >
                  Membership — Coming Soon
                </button>
              </div>
            </div>
          ) : report.matches.length ? (
            <div className="result-grid">
              {report.matches.map((result, index) => {
                const reviewDecision = report.reviews[result.id];

                return (
                  <article className="result-card" key={result.id}>
                    <div className={`video-frame ${result.tone}`}>
                      <div className="frame-grain" />
                      <span className="result-index">0{index + 1}</span>
                      <button
                        type="button"
                        disabled
                        aria-label={`Preview unavailable for ${result.title}`}
                      >
                        <i aria-hidden="true" />
                      </button>
                      <span className="duration">{result.duration}</span>
                    </div>
                    <div className="result-content">
                      <div className="result-meta">
                        <span>
                          <i>{platformMarks[result.platform]}</i>{" "}
                          {result.platform}
                        </span>
                        <b>
                          {result.confidence}%{" "}
                          {result.verification === "controlled-match"
                            ? "match score"
                            : "discovery score"}
                        </b>
                      </div>
                      <h3>{result.title}</h3>
                      <p className="uploader">Uploaded by {result.uploader}</p>
                      <div className="evidence-meta">
                        <span>{result.published}</span>
                        <span>
                          {result.views === null
                            ? "Views unavailable"
                            : `${result.views.toLocaleString()} views`}
                        </span>
                      </div>
                      <div className="evidence-signals">
                        {result.signals.map((signal) => (
                          <span key={signal}>{signal}</span>
                        ))}
                      </div>
                      {result.verification === "controlled-match" && (
                        <>
                          <div className="evidence-score-grid">
                            <span>
                              <small>VISUAL</small>
                              <strong>{result.visualSimilarity}%</strong>
                            </span>
                            <span>
                              <small>AUDIO</small>
                              <strong>{result.audioSimilarity}%</strong>
                            </span>
                            <span>
                              <small>TEMPORAL</small>
                              <strong>{result.temporalSimilarity}%</strong>
                            </span>
                          </div>
                          <p className="matched-window">
                            MATCHED WINDOW <strong>{result.matchedDuration}</strong>
                          </p>
                          <div className="transformation-list">
                            {result.transformations.map((transformation) => (
                              <span key={transformation}>{transformation}</span>
                            ))}
                          </div>
                        </>
                      )}
                      <form
                        className="review-control"
                        key={reviewDecision?.updatedAt ?? "new"}
                        onSubmit={(event) => {
                          event.preventDefault();
                          const fields = new FormData(event.currentTarget);
                          const status = fields.get("status") as ReviewStatus;
                          const note = fields.get("note")?.toString() ?? "";
                          if (status) void saveReview(result.id, status, note);
                        }}
                      >
                        <label>
                          HUMAN DECISION
                          <select
                            name="status"
                            defaultValue={reviewDecision?.status ?? ""}
                            required
                          >
                            <option value="" disabled>
                              Choose review status
                            </option>
                            {Object.entries(reviewLabels).map(([value, label]) => (
                              <option value={value} key={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          REVIEW NOTE
                          <textarea
                            name="note"
                            defaultValue={reviewDecision?.note ?? ""}
                            placeholder="Permission, licensing, or follow-up context"
                            maxLength={1000}
                            rows={2}
                          />
                        </label>
                        <button
                          type="submit"
                          disabled={reviewSaving === result.id}
                        >
                          {reviewSaving === result.id
                            ? "Saving…"
                            : reviewDecision
                              ? "Update decision"
                              : "Save decision"}
                          <span aria-hidden="true">✓</span>
                        </button>
                      </form>
                      {result.url ? (
                        <a
                          href={result.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open public post <span aria-hidden="true">↗</span>
                        </a>
                      ) : (
                        <span className="controlled-specimen">
                          CONTROLLED TEST SPECIMEN
                        </span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="results-empty-state">
              <span>NO FABRICATED MATCHES</span>
              <h2>No candidates were returned.</h2>
              <p>
                Add credentials for YouTube, Vimeo, or X to run their official
                discovery APIs. Add Reddit credentials or run the included
                SearXNG service for transcript-led web discovery. TikTok,
                Instagram, and Facebook require approved access models.
              </p>
            </div>
          )}

          <p className="demo-note">
            {isDemo
              ? "Demo scores are fixed labels from Relay’s controlled transformation benchmark. They validate the workflow, not live platform coverage."
              : "Source records and reports are stored in D1. Uploaded source files are stored privately in R2 with a SHA-256 integrity hash. Perceptual video verification requires a separate processing worker."}
          </p>
        </section>
      )}

      <footer>
        <a className="brand footer-brand" href="/">
          <BrandMark />
          <span>RELAY</span>
        </a>
        <p>Protect the original. Review every signal.</p>
        <span>© 2026 RELAY RIGHTS MONITOR</span>
      </footer>
    </main>
  );
}
