"use client";

import { useState } from "react";

type Match = {
  title: string;
  url: string;
  platform: string;
  views: number;
  confidence: number;
};

export default function Scanner() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState<Match[] | null>(null);

  async function scan() {
    setLoading(true);
    setMatches(null);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      setMatches(data.matches);
    } finally {
      setLoading(false);
    }
  }

  const stolenReach =
    matches?.reduce((sum, m) => sum + m.views, 0) ?? 0;

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.tiktok.com/@you/video/..."
          style={{
            flex: 1,
            padding: 10,
            borderRadius: 8,
            border: "1px solid #ccc",
          }}
        />
        <button
          onClick={scan}
          disabled={loading || !url}
          style={{
            padding: "10px 18px",
            borderRadius: 8,
            border: "none",
            background: "#000",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          {loading ? "Scanning..." : "Scan"}
        </button>
      </div>

      {matches && (
        <div style={{ marginTop: 24 }}>
          <h2>
            {matches.length} suspected reposts ·{" "}
            {stolenReach.toLocaleString()} stolen views
          </h2>
          {matches.map((m, i) => (
            <div
              key={i}
              style={{
                border: "1px solid #eee",
                borderRadius: 8,
                padding: 12,
                marginBottom: 10,
              }}
            >
              <div style={{ fontWeight: 600 }}>{m.title}</div>
              <div style={{ fontSize: 13, color: "#666" }}>
                {m.platform} · {m.views.toLocaleString()} views ·{" "}
                {m.confidence}% match
              </div>
              <a href={m.url} target="_blank" style={{ fontSize: 13 }}>
                {m.url}
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
