"use client";

import {
  type DragEvent,
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";

type Mode = "link" | "upload";
type Stage = "idle" | "scanning" | "results";

const results = [
  {
    platform: "YouTube",
    mark: "YT",
    title: "The original studio cut",
    source: "Creator channel",
    duration: "02:14",
    match: "98%",
    tone: "amber",
  },
  {
    platform: "TikTok",
    mark: "TT",
    title: "Vertical edit · Part 01",
    source: "@visualindex",
    duration: "00:48",
    match: "94%",
    tone: "cyan",
  },
  {
    platform: "Instagram",
    mark: "IG",
    title: "Reel with alternate audio",
    source: "@movingmatter",
    duration: "00:31",
    match: "91%",
    tone: "violet",
  },
  {
    platform: "Vimeo",
    mark: "VI",
    title: "Director’s extended version",
    source: "Studio archive",
    duration: "03:07",
    match: "87%",
    tone: "blue",
  },
];

const platformOrbs = [
  { label: "YouTube", short: "YT", className: "orb-youtube" },
  { label: "TikTok", short: "TT", className: "orb-tiktok" },
  { label: "Instagram", short: "IG", className: "orb-instagram" },
  { label: "Vimeo", short: "VI", className: "orb-vimeo" },
  { label: "X", short: "X", className: "orb-x" },
];

export default function Home() {
  const [mode, setMode] = useState<Mode>("link");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const resultsRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (stage === "results") {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [stage]);

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

    setError("");
    setStage("scanning");
    window.setTimeout(() => setStage("results"), 1800);
  }

  function resetSearch() {
    setStage("idle");
    setUrl("");
    setFile(null);
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const inputName =
    mode === "link"
      ? url || "your source link"
      : file?.name || "your uploaded video";

  return (
    <main>
      <div className="noise" aria-hidden="true" />
      <div className="aurora aurora-one" aria-hidden="true" />
      <div className="aurora aurora-two" aria-hidden="true" />

      <nav className="site-nav" aria-label="Primary navigation">
        <a className="brand" href="#top" aria-label="Relay home">
          <span className="brand-mark">
            <span />
          </span>
          <span>RELAY</span>
        </a>
        <p className="nav-note">CROSS-PLATFORM VIDEO FINDER</p>
        <a className="nav-link" href="#how-it-works">
          How it works <span aria-hidden="true">↘</span>
        </a>
      </nav>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow">
            <span className="live-dot" />
            5 NETWORKS · ONE SEARCH
          </div>
          <h1>
            Submit a video or
            <span>link to the page.</span>
          </h1>
          <p className="lede">
            It will pull out other videos from different platforms.
            <span> Follow the signal, find every version.</span>
          </p>
        </div>

        <div className={`portal-shell ${stage === "scanning" ? "is-scanning" : ""}`}>
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
            <div className="portal-topline">
              <span>INPUT / 01</span>
              <span className="secure-label">
                <i aria-hidden="true" /> PRIVATE BY DEFAULT
              </span>
            </div>

            <div className="mode-switch" aria-label="Choose input method">
              <button
                className={mode === "link" ? "active" : ""}
                type="button"
                onClick={() => chooseMode("link")}
                aria-pressed={mode === "link"}
              >
                Paste a link
              </button>
              <button
                className={mode === "upload" ? "active" : ""}
                type="button"
                onClick={() => chooseMode("upload")}
                aria-pressed={mode === "upload"}
              >
                Upload video
              </button>
            </div>

            {mode === "link" ? (
              <div className="url-field">
                <label htmlFor="video-url">VIDEO URL</label>
                <div className="input-row">
                  <span className="input-glyph" aria-hidden="true">
                    ↗
                  </span>
                  <input
                    id="video-url"
                    type="url"
                    inputMode="url"
                    placeholder="Paste a video link"
                    value={url}
                    onChange={(event) => {
                      setUrl(event.target.value);
                      setError("");
                    }}
                    disabled={stage === "scanning"}
                  />
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
                <strong>{file ? file.name : "Drop your video into the portal"}</strong>
                <small>
                  {file
                    ? `${Math.max(file.size / 1024 / 1024, 0.1).toFixed(1)} MB · ready to scan`
                    : "or click to browse · MP4, MOV, WEBM"}
                </small>
              </label>
            )}

            <p className={`form-error ${error ? "visible" : ""}`} role="alert">
              {error || "Everything looks good."}
            </p>

            <button
              className="discover-button"
              type="submit"
              disabled={stage === "scanning"}
            >
              <span>
                {stage === "scanning" ? "Tracing the signal" : "Discover videos"}
              </span>
              <i aria-hidden="true">{stage === "scanning" ? "•••" : "↗"}</i>
            </button>

            <div className="platform-list" aria-label="Supported platforms">
              <span>SEARCHING ACROSS</span>
              <div>
                <b>YouTube</b>
                <b>TikTok</b>
                <b>Instagram</b>
                <b>Vimeo</b>
                <b>X</b>
              </div>
            </div>

            {stage === "scanning" && (
              <div className="scan-overlay" role="status" aria-live="polite">
                <div className="scan-radar">
                  <span />
                </div>
                <strong>Mapping the media constellation</strong>
                <small>Comparing visual, audio, and source signals</small>
                <div className="scan-track">
                  <i />
                </div>
              </div>
            )}
          </form>
        </div>

        <a className="scroll-cue" href="#how-it-works">
          <span>SCROLL TO TRACE THE SIGNAL</span>
          <i aria-hidden="true">↓</i>
        </a>
      </section>

      <section className="process-section" id="how-it-works">
        <div className="section-index">02 / THE PROCESS</div>
        <div className="process-heading">
          <h2>
            One source.
            <span>A wider field of view.</span>
          </h2>
          <p>
            Relay reads the distinctive fingerprints in your source and maps
            where the story travels next.
          </p>
        </div>

        <div className="process-grid">
          <article>
            <span className="process-number">01</span>
            <div className="process-icon signal-in" aria-hidden="true">
              <i />
            </div>
            <h3>Signal in</h3>
            <p>Start with a public link or a video file from your device.</p>
          </article>
          <article>
            <span className="process-number">02</span>
            <div className="process-icon signal-read" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
            <h3>Patterns align</h3>
            <p>Visual, audio, and contextual clues form a unique signature.</p>
          </article>
          <article>
            <span className="process-number">03</span>
            <div className="process-icon signal-out" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </div>
            <h3>Versions surface</h3>
            <p>Related edits, reposts, and originals gather in one clean view.</p>
          </article>
        </div>
      </section>

      {stage === "results" && (
        <section className="results-section" ref={resultsRef}>
          <div className="results-header">
            <div>
              <div className="eyebrow">
                <span className="live-dot" />
                SIGNAL FOUND
              </div>
              <h2>Four likely matches</h2>
              <p>
                Demo matches for <span>{inputName}</span>
              </p>
            </div>
            <button type="button" onClick={resetSearch}>
              New search <span aria-hidden="true">↗</span>
            </button>
          </div>

          <div className="result-grid">
            {results.map((result, index) => (
              <article className="result-card" key={result.title}>
                <div className={`video-frame ${result.tone}`}>
                  <div className="frame-grain" />
                  <span className="result-index">0{index + 1}</span>
                  <button type="button" aria-label={`Preview ${result.title}`}>
                    <i aria-hidden="true" />
                  </button>
                  <span className="duration">{result.duration}</span>
                </div>
                <div className="result-content">
                  <div className="result-meta">
                    <span>
                      <i>{result.mark}</i> {result.platform}
                    </span>
                    <b>{result.match} match</b>
                  </div>
                  <h3>{result.title}</h3>
                  <p>{result.source}</p>
                  <a href="#top">
                    View source <span aria-hidden="true">↗</span>
                  </a>
                </div>
              </article>
            ))}
          </div>
          <p className="demo-note">
            Preview results are illustrative. Connect your matching service to
            surface live cross-platform sources.
          </p>
        </section>
      )}

      <footer>
        <a className="brand footer-brand" href="#top">
          <span className="brand-mark">
            <span />
          </span>
          <span>RELAY</span>
        </a>
        <p>Trace the source. See the whole story.</p>
        <span>© 2026 RELAY SIGNAL SYSTEMS</span>
      </footer>
    </main>
  );
}
