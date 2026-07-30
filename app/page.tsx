"use client";

import {
  type DragEvent,
  type FormEvent,
  useEffect,
  useState,
} from "react";
import type {
  ScanErrorResponse,
  ScanResponse,
} from "../lib/scan-contract";

type Mode = "link" | "upload";
type Stage = "idle" | "scanning";
type IntroStage = "boot" | "signal" | "agents" | "ready" | "done";

const platformOrbs = [
  { label: "YouTube", short: "YT", className: "orb-youtube" },
  { label: "TikTok", short: "TT", className: "orb-tiktok" },
  { label: "Instagram", short: "IG", className: "orb-instagram" },
  { label: "Vimeo", short: "VI", className: "orb-vimeo" },
  { label: "X", short: "X", className: "orb-x" },
];

const searchAgents = [
  {
    platform: "YouTube",
    short: "YT",
    task: "Searching titles and public metadata",
    count: "OFFICIAL API",
    className: "agent-youtube",
  },
  {
    platform: "TikTok",
    short: "TT",
    task: "Checking creator-authorized access",
    count: "CREATOR SCOPE",
    className: "agent-tiktok",
  },
  {
    platform: "Instagram",
    short: "IG",
    task: "Checking available public API coverage",
    count: "RESTRICTED SCOPE",
    className: "agent-instagram",
  },
  {
    platform: "Facebook",
    short: "FB",
    task: "Checking Rights Manager and indexed public pages",
    count: "APPROVED SCOPE",
    className: "agent-facebook",
  },
  {
    platform: "Vimeo",
    short: "VI",
    task: "Searching public catalog metadata",
    count: "OFFICIAL API",
    className: "agent-vimeo",
  },
  {
    platform: "X",
    short: "X",
    task: "Searching recent public video posts",
    count: "7-DAY WINDOW",
    className: "agent-x",
  },
  {
    platform: "Reddit",
    short: "RD",
    task: "Searching public video posts with OAuth",
    count: "OFFICIAL API",
    className: "agent-reddit",
  },
  {
    platform: "Dailymotion",
    short: "DM",
    task: "Checking indexed public video pages",
    count: "WEB INDEX",
    className: "agent-dailymotion",
  },
  {
    platform: "Twitch",
    short: "TW",
    task: "Checking indexed public clips and VOD pages",
    count: "WEB INDEX",
    className: "agent-twitch",
  },
  {
    platform: "Transcript web",
    short: "WB",
    task: "Searching exact spoken phrases across platforms",
    count: "SEARXNG / CSE",
    className: "agent-web",
  },
];

const benchmarkAgents = [
  {
    platform: "YouTube",
    short: "YT",
    task: "Testing exact copy and cropped edit",
    count: "2 LABELED CASES",
    className: "agent-youtube",
  },
  {
    platform: "TikTok",
    short: "TT",
    task: "Testing a vertical reframe",
    count: "1 LABELED CASE",
    className: "agent-tiktok",
  },
  {
    platform: "Instagram",
    short: "IG",
    task: "Testing a captioned excerpt",
    count: "1 LABELED CASE",
    className: "agent-instagram",
  },
  {
    platform: "Vimeo",
    short: "VI",
    task: "Testing a watermarked copy",
    count: "1 LABELED CASE",
    className: "agent-vimeo",
  },
  {
    platform: "X",
    short: "X",
    task: "Testing a shortened clip",
    count: "1 LABELED CASE",
    className: "agent-x",
  },
];

const introCopy: Record<Exclude<IntroStage, "done">, [string, string]> = {
  boot: ["Waking the rights monitor", "Initializing Relay protection systems"],
  signal: ["Original source secured", "Source registration node online"],
  agents: ["Five monitoring agents online", "Public network search is ready"],
  ready: ["Your watch field is ready", "Entering Relay Rights"],
};

function BrandMark() {
  return (
    <span className="brand-mark">
      <span />
    </span>
  );
}

function IntroSequence({
  stage,
  progress,
  onSkip,
}: {
  stage: Exclude<IntroStage, "done">;
  progress: number;
  onSkip: () => void;
}) {
  const copy = introCopy[stage];

  return (
    <div className={`load-sequence load-${stage}`} role="status" aria-live="polite">
      <div className="load-topbar">
        <div className="brand">
          <BrandMark />
          <span>RELAY</span>
        </div>
        <span>BOOT SEQUENCE / 01</span>
        <button type="button" onClick={onSkip}>
          Skip intro
        </button>
      </div>

      <div className="load-field" aria-hidden="true">
        <div className="load-grid" />
        <div className="load-ring load-ring-a" />
        <div className="load-ring load-ring-b" />
        <div className="load-beam load-beam-a" />
        <div className="load-beam load-beam-b" />
        <div className="load-beam load-beam-c" />

        <div className="load-source">
          <div className="load-source-frame">
            <span />
          </div>
          <small>SOURCE / 00:48</small>
        </div>

        {platformOrbs.map((platform, index) => (
          <div className={`load-component load-component-${index + 1}`} key={platform.label}>
            <i>{platform.short}</i>
            <span>{platform.label}</span>
            <b>ONLINE</b>
          </div>
        ))}

        <div className="load-sweep" />
      </div>

      <div className="load-copy">
        <span className="load-kicker">RELAY RIGHTS MONITOR</span>
        <h2>{copy[0]}</h2>
        <p>{copy[1]}</p>
      </div>

      <div className="load-progress">
        <div>
          <i style={{ transform: `scaleX(${progress / 100})` }} />
        </div>
        <span>{progress.toString().padStart(3, "0")}%</span>
      </div>
    </div>
  );
}

function SearchMission({
  progress,
  inputName,
  controlled,
  onSkip,
}: {
  progress: number;
  inputName: string;
  controlled: boolean;
  onSkip: () => void;
}) {
  const phase =
    controlled && progress >= 30 && progress < 72
      ? "Benchmark nodes testing in parallel"
      : controlled && progress >= 72
        ? "Ranking controlled evidence"
      : progress < 30
      ? "Registering the original source"
      : progress < 72
        ? "Provider agents searching in parallel"
        : "Ranking unverified candidates";
  const activeAgents = controlled ? benchmarkAgents : searchAgents;

  return (
    <div className="search-mission" role="status" aria-live="polite">
      <div className="mission-grid" aria-hidden="true" />
      <div className="mission-topbar">
        <div className="brand">
          <BrandMark />
          <span>RELAY</span>
        </div>
        <div className="mission-status">
          <i />
          SEARCH FIELD ACTIVE
        </div>
        <button type="button" onClick={onSkip}>
          Skip animation
        </button>
      </div>

      <div className="mission-hud mission-hud-left">
        <span>MONITORING AGENTS</span>
        <b>
          {activeAgents.length.toString().padStart(2, "0")} /{" "}
          {activeAgents.length.toString().padStart(2, "0")}
        </b>
      </div>
      <div className="mission-hud mission-hud-right">
        <span>{controlled ? "BENCHMARK COVERAGE" : "PUBLIC FIELD COVERAGE"}</span>
        <b>{Math.min(98, progress + 7)}%</b>
      </div>

      <div className="mission-field" aria-hidden="true">
        <div className="mission-orbit mission-orbit-one" />
        <div className="mission-orbit mission-orbit-two" />
        <div className="mission-orbit mission-orbit-three" />
        <div className="mission-crosshair mission-crosshair-x" />
        <div className="mission-crosshair mission-crosshair-y" />

        {activeAgents.map((agent, index) => (
          <div className={`agent-node ${agent.className}`} key={agent.platform}>
            <div className="agent-scanline" />
            <div className="agent-head">
              <i>{agent.short}</i>
              <span>AGENT 0{index + 1}</span>
              <b>LIVE</b>
            </div>
            <strong>{agent.platform}</strong>
            <p>{agent.task}</p>
            <div className="agent-meter">
              <i />
            </div>
            <small>{agent.count}</small>
          </div>
        ))}

        <div className="mission-beam beam-youtube" />
        <div className="mission-beam beam-tiktok" />
        <div className="mission-beam beam-instagram" />
        <div className="mission-beam beam-vimeo" />
        <div className="mission-beam beam-x" />

        <div className="source-core">
          <div className="core-pulse core-pulse-one" />
          <div className="core-pulse core-pulse-two" />
          <div className="core-visual">
            <span />
            <i />
          </div>
          <small>ORIGINAL SOURCE</small>
        </div>
      </div>

      <div className="mission-footer">
        <div className="mission-copy">
          <span>SEARCH / 02</span>
          <h2>{phase}</h2>
          <p>{inputName}</p>
        </div>
        <div className="mission-progress">
          <div>
            <i style={{ transform: `scaleX(${progress / 100})` }} />
          </div>
          <span>{progress.toString().padStart(3, "0")}%</span>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [mode, setMode] = useState<Mode>("link");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [introStage, setIntroStage] = useState<IntroStage>("boot");
  const [introProgress, setIntroProgress] = useState(0);
  const [searchProgress, setSearchProgress] = useState(0);
  const [scanResult, setScanResult] = useState<ScanResponse | null>(null);
  const [animationComplete, setAnimationComplete] = useState(false);
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [missionInput, setMissionInput] = useState("");
  const [isDemoRun, setIsDemoRun] = useState(false);
  const [transcriptHint, setTranscriptHint] = useState("");

  const inputName =
    mode === "link"
      ? url || "your source link"
      : file?.name || "your uploaded video";

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      const reducedMotionTimer = window.setTimeout(() => {
        setIntroProgress(100);
        setIntroStage("done");
      }, 0);
      return () => window.clearTimeout(reducedMotionTimer);
    }

    const progressTimer = window.setInterval(() => {
      setIntroProgress((value) => Math.min(100, value + 2));
    }, 65);
    const timers = [
      window.setTimeout(() => setIntroStage("signal"), 650),
      window.setTimeout(() => setIntroStage("agents"), 1450),
      window.setTimeout(() => setIntroStage("ready"), 2600),
      window.setTimeout(() => {
        setIntroProgress(100);
        setIntroStage("done");
      }, 3800),
    ];

    return () => {
      window.clearInterval(progressTimer);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  useEffect(() => {
    if (stage !== "scanning") return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reducedMotion ? 650 : 5200;
    const startedAt = Date.now();

    const progressTimer = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      setSearchProgress(Math.min(99, Math.round((elapsed / duration) * 100)));
    }, 70);
    const finishTimer = window.setTimeout(() => {
      setSearchProgress(100);
      setAnimationComplete(true);
    }, duration);

    return () => {
      window.clearInterval(progressTimer);
      window.clearTimeout(finishTimer);
    };
  }, [stage]);

  useEffect(() => {
    if (!animationComplete || !scanResult) return;

    const params = new URLSearchParams({ scan: scanResult.scanId });
    window.location.assign(`/results?${params.toString()}`);
  }, [animationComplete, scanResult]);

  useEffect(() => {
    const shouldLock = introStage !== "done" || stage === "scanning";
    document.body.style.overflow = shouldLock ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [introStage, stage]);

  function chooseMode(nextMode: Mode) {
    setMode(nextMode);
    setError("");
  }

  function acceptFile(nextFile?: File) {
    if (!nextFile) return;
    if (!nextFile.type.startsWith("video/")) {
      setError("Choose a video file to begin.");
      return;
    }
    setFile(nextFile);
    setError("");
  }

  function onDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    acceptFile(event.dataTransfer.files[0]);
  }

  function discover(event: FormEvent) {
    event.preventDefault();

    if (mode === "link" && !url.trim()) {
      setError("Paste a video link to start the search.");
      return;
    }
    if (mode === "upload" && !file) {
      setError("Drop in a video or choose one from your device.");
      return;
    }
    if (!rightsConfirmed) {
      setError("Confirm that you are authorized to monitor this video.");
      return;
    }

    setError("");
    setScanResult(null);
    setAnimationComplete(false);
    setMissionInput(inputName);
    setIsDemoRun(false);
    setStage("scanning");
    void requestScan();
  }

  function runControlledDemo() {
    setError("");
    setScanResult(null);
    setAnimationComplete(false);
    setMissionInput("Relay controlled benchmark");
    setIsDemoRun(true);
    setStage("scanning");
    void requestScan(true);
  }

  async function requestScan(demo = false) {
    try {
      const requestInit: RequestInit =
        demo
          ? {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                source: "relay-controlled-benchmark.mp4",
                sourceType: "link",
                demo: true,
              }),
            }
          : mode === "upload" && file
          ? {
              method: "POST",
              body: (() => {
                const form = new FormData();
                form.set("file", file);
                if (transcriptHint.trim()) {
                  form.set("transcriptHint", transcriptHint.trim());
                }
                return form;
              })(),
            }
          : {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                source: url.trim(),
                sourceType: "link",
                transcriptHint: transcriptHint.trim() || undefined,
              }),
            };
      const response = await fetch("/api/scan", {
        ...requestInit,
      });
      const payload = (await response.json()) as ScanResponse | ScanErrorResponse;

      if (!response.ok || !("scanId" in payload)) {
        throw new Error(
          "error" in payload ? payload.error : "The scan could not be started.",
        );
      }

      const completed = await waitForScan(payload.scanId);
      setScanResult(completed);
    } catch (requestError) {
      setStage("idle");
      setSearchProgress(0);
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The scan could not be started.",
      );
    }
  }

  async function waitForScan(scanId: string) {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const response = await fetch(
        `/api/scan?${new URLSearchParams({ scan: scanId }).toString()}`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as ScanResponse | ScanErrorResponse;

      if (!response.ok || !("scanId" in payload)) {
        throw new Error(
          "error" in payload ? payload.error : "The scan could not be loaded.",
        );
      }
      if (payload.status === "completed") return payload;
      if (payload.status === "failed") {
        throw new Error(payload.error || "The scan failed.");
      }

      await new Promise((resolve) => window.setTimeout(resolve, 650));
    }
    throw new Error("The scan is taking longer than expected. Try again.");
  }

  function moveCursor(event: React.PointerEvent<HTMLElement>) {
    event.currentTarget.style.setProperty("--cursor-x", `${event.clientX}px`);
    event.currentTarget.style.setProperty("--cursor-y", `${event.clientY}px`);
  }

  return (
    <main
      className={introStage === "done" ? "dashboard-ready" : "intro-active"}
      onPointerMove={moveCursor}
    >
      <div className="cursor-light" aria-hidden="true" />
      <div className="noise" aria-hidden="true" />
      <div className="aurora aurora-one" aria-hidden="true" />
      <div className="aurora aurora-two" aria-hidden="true" />

      {introStage !== "done" && (
        <IntroSequence
          stage={introStage}
          progress={introProgress}
          onSkip={() => {
            setIntroProgress(100);
            setIntroStage("done");
          }}
        />
      )}

      {stage === "scanning" && (
        <SearchMission
          progress={searchProgress}
          inputName={missionInput || inputName}
          controlled={isDemoRun}
          onSkip={() => {
            setSearchProgress(100);
            setAnimationComplete(true);
          }}
        />
      )}

      <nav className="site-nav dashboard-piece piece-nav" aria-label="Primary navigation">
        <a className="brand" href="#top" aria-label="Relay home">
          <BrandMark />
          <span>RELAY</span>
        </a>
        <p className="nav-note">
          <i />
          VIDEO RIGHTS MONITOR
        </p>
        <a className="nav-link" href="/history">
          Case history <span aria-hidden="true">↗</span>
        </a>
      </nav>

      <section className="hero" id="top">
        <div className="hero-copy dashboard-piece piece-copy">
          <div className="eyebrow">
            <span className="live-dot" />
            RIGHTS MONITORING · PUBLIC POSTS
          </div>
          <h1>
            Know where your
            <span>video travels.</span>
          </h1>
          <p className="lede">
            Register your original once. Relay searches supported public sources
            for likely copies, edits, crops, and reposts.
            <span> You decide what is authorized.</span>
          </p>
        </div>

        <div
          className={`portal-shell dashboard-piece piece-portal ${
            stage === "scanning" ? "is-scanning" : ""
          }`}
        >
          <div className="orbit orbit-outer" aria-hidden="true" />
          <div className="orbit orbit-inner" aria-hidden="true" />

          {platformOrbs.map((platform) => (
            <div
              className={`platform-orb ${platform.className}`}
              key={platform.label}
              aria-label={platform.label}
            >
              <span>{platform.short}</span>
              <em>{platform.label}</em>
            </div>
          ))}

          <form className="portal-card" onSubmit={discover}>
            <div className="portal-glint" aria-hidden="true" />
            <div className="portal-topline">
              <span>ORIGINAL SOURCE / 01</span>
              <span className="secure-label">
                <i aria-hidden="true" /> PRIVATE INPUT
              </span>
            </div>

            <div className="mode-switch" aria-label="Choose input method">
              <button
                className={mode === "link" ? "active" : ""}
                type="button"
                onClick={() => chooseMode("link")}
                aria-pressed={mode === "link"}
              >
                Original link
              </button>
              <button
                className={mode === "upload" ? "active" : ""}
                type="button"
                onClick={() => chooseMode("upload")}
                aria-pressed={mode === "upload"}
              >
                Original file
              </button>
            </div>

            {mode === "link" ? (
              <div className="url-field">
                <label htmlFor="video-url">ORIGINAL VIDEO URL</label>
                <div className="input-row">
                  <span className="input-glyph" aria-hidden="true">
                    ↗
                  </span>
                  <input
                    id="video-url"
                    type="url"
                    inputMode="url"
                    placeholder="Paste the original video link"
                    value={url}
                    onChange={(event) => {
                      setUrl(event.target.value);
                      setError("");
                    }}
                    disabled={stage === "scanning"}
                  />
                  <span className="input-signal" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                </div>
              </div>
            ) : (
              <label
                className={`drop-zone ${isDragging ? "is-dragging" : ""}`}
                onDragEnter={() => setIsDragging(true)}
                onDragLeave={() => setIsDragging(false)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={onDrop}
              >
                <input
                  type="file"
                  accept="video/*"
                  onChange={(event) => acceptFile(event.target.files?.[0])}
                  disabled={stage === "scanning"}
                />
                <span className="upload-symbol" aria-hidden="true">
                  <i />
                </span>
                <strong>{file ? file.name : "Drop the original source video"}</strong>
                <small>
                  {file
                    ? `${Math.max(file.size / 1024 / 1024, 0.1).toFixed(1)} MB · ready to scan`
                    : "or click to browse · MP4, MOV, WEBM"}
                </small>
              </label>
            )}

            <details className="transcript-seed">
              <summary>
                <span>Add transcript or memorable spoken lines</span>
                <i aria-hidden="true">+</i>
              </summary>
              <label htmlFor="transcript-hint">
                TRANSCRIPT DISCOVERY SEED
              </label>
              <textarea
                id="transcript-hint"
                placeholder="Paste a transcript or a few distinctive sentences from the video"
                value={transcriptHint}
                onChange={(event) => {
                  setTranscriptHint(event.target.value);
                  setError("");
                }}
                maxLength={20000}
                rows={4}
                disabled={stage === "scanning"}
              />
              <small>
                Relay searches exact spoken phrases across indexed public video pages.
                Uploaded files can also use the local Faster-Whisper worker.
              </small>
            </details>

            <p className={`form-error ${error ? "visible" : ""}`} role="alert">
              {error || "Everything looks good."}
            </p>

            <label className="rights-check">
              <input
                type="checkbox"
                checked={rightsConfirmed}
                onChange={(event) => {
                  setRightsConfirmed(event.target.checked);
                  setError("");
                }}
              />
              <i aria-hidden="true" />
              <span>I own this video or I’m authorized to monitor it.</span>
            </label>

            <button
              className="discover-button"
              type="submit"
              disabled={stage === "scanning"}
            >
              <span>
                {stage === "scanning" ? "Scanning public posts" : "Scan for copies"}
              </span>
              <i aria-hidden="true">{stage === "scanning" ? "•••" : "↗"}</i>
            </button>

            <button
              className="demo-button"
              type="button"
              onClick={runControlledDemo}
              disabled={stage === "scanning"}
            >
              <span>Run controlled evidence demo</span>
              <small>No credentials required</small>
            </button>

            <div className="platform-list" aria-label="Supported platforms">
              <span>MONITORING</span>
              <div>
                <b>YouTube</b>
                <b>TikTok</b>
                <b>Meta</b>
                <b>Vimeo</b>
                <b>X</b>
                <b>Reddit</b>
                <b>Dailymotion</b>
                <b>Twitch</b>
                <b>Transcript web</b>
              </div>
            </div>
            <p className="scan-scope">
              Public posts only · No automatic claims or takedowns
            </p>
          </form>
        </div>

        <a className="scroll-cue dashboard-piece piece-scroll" href="#how-it-works">
          <span>SCROLL TO TRACE THE SIGNAL</span>
          <i aria-hidden="true">↓</i>
        </a>
      </section>

      <section className="detection-section" id="what-we-detect">
        <div className="detection-intro">
          <span>02 / RESILIENT MATCHING</span>
          <h2>Copies rarely look identical.</h2>
          <p>
            Relay is designed to surface transformed versions for review—not
            only exact duplicates.
          </p>
        </div>
        <div className="detection-list">
          {[
            ["01", "Crops & reframes", "Landscape turned vertical"],
            ["02", "Overlays & marks", "New captions or watermarks"],
            ["03", "Audio changes", "Muted or replaced sound"],
            ["04", "Speed edits", "Slowed down or accelerated"],
            ["05", "Partial clips", "Excerpts inside compilations"],
          ].map(([number, title, detail]) => (
            <article key={title}>
              <span>{number}</span>
              <div className="detection-symbol" aria-hidden="true">
                <i />
                <i />
              </div>
              <h3>{title}</h3>
              <p>{detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="process-section" id="how-it-works">
        <div className="section-index">03 / FROM SOURCE TO EVIDENCE</div>
        <div className="process-heading">
          <h2>
            Monitor broadly.
            <span>Judge carefully.</span>
          </h2>
          <p>
            A match is a lead, not a verdict. Relay organizes likely copies so
            the rights holder can review the evidence and decide what is permitted.
          </p>
        </div>

        <div className="process-grid">
          <article>
            <span className="process-number">01</span>
            <div className="process-icon signal-in" aria-hidden="true">
              <i />
            </div>
            <h3>Register the original</h3>
            <p>Provide the source file or canonical link you have rights to monitor.</p>
          </article>
          <article>
            <span className="process-number">02</span>
            <div className="process-icon signal-read" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
            <h3>Agents scan in parallel</h3>
            <p>Permitted provider searches collect candidates for careful review.</p>
          </article>
          <article>
            <span className="process-number">03</span>
            <div className="process-icon signal-out" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </div>
            <h3>Review the evidence</h3>
            <p>Inspect uploader, reach, timing, and match signals before taking action.</p>
          </article>
        </div>
      </section>

      <footer>
        <a className="brand footer-brand" href="#top">
          <BrandMark />
          <span>RELAY</span>
        </a>
        <p>Protect the original. Review every signal.</p>
        <span>© 2026 RELAY RIGHTS MONITOR</span>
      </footer>
    </main>
  );
}
