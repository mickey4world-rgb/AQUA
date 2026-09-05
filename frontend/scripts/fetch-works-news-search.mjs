/**
 * WORKS ニュースサーチ — GHA から SWA cron API を叩く
 * 重い RSS＋解説は API（maxDuration）側で実行し、ここで成功判定する。
 */
const cronSecret =
  process.env.SOLUNA_CRON_SECRET?.trim() || process.env.WORKS_CRON_SECRET?.trim();
const baseUrl = (process.env.PRODUCTION_URL || "https://www.aquacore.net").replace(
  /\/$/,
  "",
);

if (!cronSecret) {
  console.error("SOLUNA_CRON_SECRET（または WORKS_CRON_SECRET）が必要です。");
  process.exit(1);
}

const force = process.argv.includes("--force");

const response = await fetch(`${baseUrl}/api/works/news-search/cron`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${cronSecret}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ force }),
});

const payload = await response.json().catch(() => ({}));
console.log(JSON.stringify(payload, null, 2));
console.log(`HTTP ${response.status}`);

if (!response.ok || payload?.ok !== true) {
  process.exit(1);
}

const counts = payload.counts ?? {};
for (const key of ["ai", "systems", "economy", "government"]) {
  const n = Number(counts[key] ?? 0);
  if (n < 5) {
    console.warn(`::warning::category ${key} has only ${n} items (want >= 5)`);
  }
}
