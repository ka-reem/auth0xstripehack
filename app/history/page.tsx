"use client";
/* eslint-disable @next/next/no-html-link-for-pages */

import { useEffect, useState } from "react";
import type { ScanHistoryItem } from "../../lib/scan-contract";

function BrandMark() {
  return (
    <span className="brand-mark">
      <span />
    </span>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function HistoryPage() {
  const [scans, setScans] = useState<ScanHistoryItem[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;

    async function loadScans() {
      try {
        const response = await fetch("/api/scans", { cache: "no-store" });
        const payload = (await response.json()) as {
          scans?: ScanHistoryItem[];
          error?: string;
        };
        if (!response.ok || !Array.isArray(payload.scans)) {
          throw new Error(payload.error || "Case history could not be loaded.");
        }
        if (!cancelled) {
          setScans(payload.scans);
          setState("ready");
        }
      } catch {
        if (!cancelled) setState("error");
      }
    }

    void loadScans();
    return () => {
      cancelled = true;
    };
  }, []);

  function moveCursor(event: React.PointerEvent<HTMLElement>) {
    event.currentTarget.style.setProperty("--cursor-x", `${event.clientX}px`);
    event.currentTarget.style.setProperty("--cursor-y", `${event.clientY}px`);
  }

  return (
    <main className="history-page dashboard-ready" onPointerMove={moveCursor}>
      <div className="cursor-light" aria-hidden="true" />
      <div className="noise" aria-hidden="true" />
      <div className="aurora aurora-one" aria-hidden="true" />
      <div className="aurora aurora-two" aria-hidden="true" />

      <nav className="site-nav results-nav" aria-label="History navigation">
        <a className="brand" href="/" aria-label="Relay home">
          <BrandMark />
          <span>RELAY</span>
        </a>
        <p className="nav-note">
          <i />
          RIGHTS MONITOR / CASE HISTORY
        </p>
        <a className="nav-link" href="/">
          New scan <span aria-hidden="true">↗</span>
        </a>
      </nav>

      <section className="history-section">
        <div className="history-heading">
          <div>
            <div className="eyebrow">
              <span className="live-dot" />
              PERSISTENT CASE RECORDS
            </div>
            <h1>Every source.<br /><span>Every decision.</span></h1>
          </div>
          <p>
            Return to earlier scans, continue evidence review, and keep
            controlled demonstrations separate from live provider searches.
          </p>
        </div>

        {state === "loading" && (
          <div className="history-state" role="status">
            Loading case records…
          </div>
        )}
        {state === "error" && (
          <div className="history-state" role="alert">
            Case history could not be loaded. Return to the dashboard and try again.
          </div>
        )}
        {state === "ready" && !scans.length && (
          <div className="history-empty">
            <span>NO CASES YET</span>
            <h2>Your first scan will appear here.</h2>
            <a href="/">Register an original <i aria-hidden="true">↗</i></a>
          </div>
        )}
        {state === "ready" && scans.length > 0 && (
          <div className="history-table" role="table" aria-label="Scan history">
            <div className="history-row history-labels" role="row">
              <span>CASE</span>
              <span>MODE</span>
              <span>CANDIDATES</span>
              <span>REVIEWED</span>
              <span>UPDATED</span>
              <span aria-hidden="true" />
            </div>
            {scans.map((scan, index) => (
              <a
                className="history-row"
                href={`/results?scan=${encodeURIComponent(scan.scanId)}`}
                role="row"
                key={scan.scanId}
              >
                <span className="history-case">
                  <i>{String(index + 1).padStart(2, "0")}</i>
                  <strong>{scan.query}</strong>
                  <small>{scan.scanId.slice(0, 13).toUpperCase()}</small>
                </span>
                <span>
                  <b className={scan.dataMode === "controlled-demo" ? "demo-mode" : ""}>
                    {scan.dataMode === "controlled-demo" ? "Controlled demo" : "Live"}
                  </b>
                </span>
                <span><strong>{scan.candidateCount}</strong></span>
                <span><strong>{scan.reviewedCount}</strong></span>
                <span>{formatDate(scan.updatedAt)}</span>
                <span className="history-open" aria-hidden="true">↗</span>
              </a>
            ))}
          </div>
        )}
      </section>

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
