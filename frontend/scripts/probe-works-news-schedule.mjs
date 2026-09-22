/**
 * 定時スキップ判定の本番プローブ（次の schedule が何をするかを今検証する）。
 *
 * Usage:
 *   node frontend/scripts/probe-works-news-schedule.mjs
 *   node frontend/scripts/probe-works-news-schedule.mjs --gate   # GITHUB_OUTPUT に skip= を書く
 *
 * Env: SOLUNA_CRON_SECRET, PRODUCTION_URL, GITHUB_OUTPUT (with --gate)
 */
import { appendFileSync } from "fs";

const cronSecret =
  process.env.SOLUNA_CRON_SECRET?.trim() || process.env.WORKS_CRON_SECRET?.trim();
const baseUrl = (process.env.PRODUCTION_URL || "https://www.aquacore.net").replace(
  /\/$/,
  "",
);
const gateMode = process.argv.includes("--gate");
const requireComplete = process.argv.includes("--require-complete");

if (!cronSecret) {
  console.error("SOLUNA_CRON_SECRET（または WORKS_CRON_SECRET）が必要です。");
  process.exit(1);
}

function hasSchema(status) {
  return typeof status.isToday === "boolean" && typeof status.expectedDigestId === "string";
}

function wouldSkip(status) {
  return (
    status.isToday === true &&
    status.enrichmentOk === true &&
    status.enrichmentStatus === "complete" &&
    typeof status.digestId === "string" &&
    status.digestId === status.expectedDigestId
  );
}

function writeGate(skip, schema) {
  const out = process.env.GITHUB_OUTPUT;
  if (!out) return;
  appendFileSync(out, `skip=${skip}\nschema=${schema}\n`);
}

const response = await fetch(`${baseUrl}/api/works/news-search/cron`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${cronSecret}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ step: "status" }),
});
const text = await response.text();
let status = {};
try {
  status = JSON.parse(text);
} catch {
  console.error("status JSON parse failed", text.slice(0, 400));
  if (gateMode) writeGate("false", "missing");
  process.exit(1);
}

console.log(JSON.stringify(status, null, 2));
console.log(`status HTTP ${response.status}`);

if (!response.ok) {
  console.error("::error::status endpoint failed — next schedule cannot decide correctly");
  if (gateMode) writeGate("false", "missing");
  process.exit(1);
}

if (!hasSchema(status)) {
  console.error(
    "::error::status schema missing isToday/expectedDigestId — old deploy; next schedule would mis-skip on yesterday complete",
  );
  if (gateMode) {
    writeGate("false", "stale");
    console.warn("::warning::refusing skip due to stale schema");
    process.exit(0);
  }
  process.exit(1);
}

const skip = wouldSkip(status);
console.log(
  `[schedule-probe] next night schedule would skip=${skip} digestId=${status.digestId} expected=${status.expectedDigestId} isToday=${status.isToday}`,
);

if (gateMode) {
  writeGate(skip ? "true" : "false", "ok");
  if (skip) {
    console.log("当日分は完了済み — checkout 以降の npm/再enrich をスキップ可");
  } else {
    console.log("当日未完了 — フルパイプラインへ");
  }
  process.exit(0);
}

if (requireComplete) {
  if (!skip) {
    console.error(
      "::error::当日（JST）AI解説が未完了、またはスキーマ不足。昨日 complete を成功扱いにしない。",
    );
    process.exit(1);
  }
  console.log("[schedule-probe] require-complete ok", status.digestId);
  process.exit(0);
}

if (status.reason === "today-missing") {
  console.log(
    "[schedule-probe] today-missing → next schedule MUST run full pipeline (not skip). Probe OK.",
  );
} else if (skip) {
  console.log(
    "[schedule-probe] today already complete → next schedule correctly skips. Probe OK.",
  );
} else {
  console.log(
    "[schedule-probe] today incomplete → next schedule will rebuild/enrich. Probe OK.",
  );
}
