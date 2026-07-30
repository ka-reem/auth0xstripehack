import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test, { after, before } from "node:test";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const vinextCli = fileURLToPath(
  new URL("../node_modules/vinext/dist/cli.js", import.meta.url),
);
const baseUrl = "http://localhost:3217";
let server;
let serverOutput = "";

before(async () => {
  server = spawn(process.execPath, [vinextCli, "dev", "--port", "3217"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      WRANGLER_LOG_PATH: ".wrangler/wrangler-test.log",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  server.stdout.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });
  server.stderr.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });

  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // The local test server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Test server did not start.\n${serverOutput}`);
});

after(() => {
  server?.kill();
});

function request(path, init) {
  return fetch(`${baseUrl}${path}`, init);
}

test("renders the Relay source dashboard", async () => {
  const response = await request("/");

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /Know where your/);
  assert.match(html, /video travels/);
  assert.match(html, /Scan for copies/);
  assert.match(html, /authorized to monitor/);
});

test("renders the standalone report shell", async () => {
  const response = await request(
    "/results?scan=test-scan&source=https%3A%2F%2Fexample.com%2Foriginal&sourceType=link",
  );

  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /RIGHTS MONITOR/);
  assert.match(html, /PROVIDER JOB ACTIVE/);
});

test("creates and completes a persistent scan job", async () => {
  const response = await request("/api/scan", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      source: "https://example.com/original",
      sourceType: "link",
    }),
  });

  assert.equal(response.status, 202);
  const payload = await response.json();
  assert.equal(payload.source, "https://example.com/original");
  assert.equal(payload.query, "original");
  assert.equal(payload.sourceType, "link");
  assert.equal(payload.dataMode, "live");
  assert.equal(payload.status, "queued");
  assert.equal(payload.matches.length, 0);

  const completedResponse = await request(
    `/api/scan?scan=${encodeURIComponent(payload.scanId)}`,
  );
  assert.equal(completedResponse.status, 200);
  const completed = await completedResponse.json();
  assert.equal(completed.status, "completed");
  assert.equal(completed.progress, 100);
  assert.equal(completed.providers.length, 10);
  assert.equal(completed.matches.length, 0);
  assert.deepEqual(
    completed.providers.map((provider) => provider.platform),
    [
      "YouTube",
      "TikTok",
      "Instagram",
      "Facebook",
      "Vimeo",
      "X",
      "Reddit",
      "Dailymotion",
      "Twitch",
      "Web",
    ],
  );
  assert.match(
    completed.notice,
    /without fabricating matches|discovery candidates/i,
  );
});

test("turns a supplied transcript into distinctive discovery phrases", async () => {
  const response = await request("/api/scan", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      source: "https://example.com/transcript-source",
      sourceType: "link",
      transcriptHint:
        "Our miniature satellite follows the cobalt river beyond the winter observatory. The final signal arrives exactly seventeen minutes before sunrise.",
    }),
  });

  assert.equal(response.status, 202);
  const created = await response.json();
  assert.equal(created.sourceMetadata.transcriptStatus, "provided");
  assert.equal(created.sourceMetadata.transcriptProvider, "manual");
  assert.ok(created.sourceMetadata.discoveryPhrases.length >= 1);

  const completedResponse = await request(
    `/api/scan?scan=${encodeURIComponent(created.scanId)}`,
  );
  const completed = await completedResponse.json();
  assert.equal(completed.status, "completed");
  assert.equal(completed.sourceMetadata.transcriptStatus, "provided");
  assert.match(
    completed.sourceMetadata.discoveryPhrases.join(" "),
    /cobalt river|seventeen minutes/i,
  );
});

test("runs the controlled benchmark and persists a human review", async () => {
  const createdResponse = await request("/api/scan", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      source: "relay-controlled-benchmark.mp4",
      sourceType: "link",
      demo: true,
    }),
  });
  assert.equal(createdResponse.status, 202);
  const created = await createdResponse.json();
  assert.equal(created.sourceType, "demo");
  assert.equal(created.dataMode, "controlled-demo");

  const completedResponse = await request(
    `/api/scan?scan=${encodeURIComponent(created.scanId)}`,
  );
  assert.equal(completedResponse.status, 200);
  const completed = await completedResponse.json();
  assert.equal(completed.status, "completed");
  assert.equal(completed.matches.length, 6);
  assert.equal(completed.matches[0].verification, "controlled-match");
  assert.match(completed.notice, /controlled benchmark/i);

  const reviewResponse = await request("/api/scan", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      scanId: created.scanId,
      matchId: completed.matches[0].id,
      status: "investigate",
      note: "Confirm licensing with the channel owner.",
    }),
  });
  assert.equal(reviewResponse.status, 200);
  const reviewed = await reviewResponse.json();
  assert.equal(
    reviewed.reviews[completed.matches[0].id].status,
    "investigate",
  );

  const historyResponse = await request("/api/scans");
  assert.equal(historyResponse.status, 200);
  const history = await historyResponse.json();
  const historyItem = history.scans.find(
    (scan) => scan.scanId === created.scanId,
  );
  assert.equal(historyItem.candidateCount, 6);
  assert.equal(historyItem.reviewedCount, 1);
});

test("rejects incomplete scan requests", async () => {
  const response = await request("/api/scan", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });

  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.match(payload.error, /required/i);
});
