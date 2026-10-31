/**
 * WORKS ニュースサーチ（GHA）
 * RSS 収集は本番 API（works-news-search-rss.ts）に一本化。
 * ここに別 FEEDS を持つとセキュリティ等が永久に空になる（2026-11 障害クラス）。
 * --enrich-only: 既存 digest の未完了カテゴリだけ再試行。
 * --force: 当日分を上書き build。
 * --soft-incomplete: 深夜リトライ枠用。enrich 未完了でも exit 0（朝ゲートは厳格失敗のまま）。
 */
const cronSecret =
  process.env.SOLUNA_CRON_SECRET?.trim() || process.env.WORKS_CRON_SECRET?.trim();
const baseUrl = (process.env.PRODUCTION_URL || "https://www.aquacore.net").replace(
  /\/$/,
  "",
);
const force = process.argv.includes("--force");
const enrichOnly = process.argv.includes("--enrich-only");
/** 同夜の再試行枠: 未完了でも workflow red にしない（メールノイズ抑制）。朝ゲートは別。 */
const softIncomplete = process.argv.includes("--soft-incomplete");
const RETRY_PASSES = 3;
const RETRY_DELAY_MS = 8_000;

if (!cronSecret) {
  console.error("SOLUNA_CRON_SECRET（または WORKS_CRON_SECRET）が必要です。");
  process.exit(1);
}

// 正本は frontend/lib/types/works-news-search.ts の NEWS_SEARCH_CATEGORIES。
const CATEGORIES = [
  "ai",
  "systems",
  "economy",
  "government",
  "security",
  "national-security",
];

async function postCron(body) {
  const response = await fetch(`${baseUrl}/api/works/news-search/cron`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cronSecret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let payload = {};
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { raw: text.slice(0, 400) };
  }
  console.log(JSON.stringify(payload, null, 2));
  console.log(`cron HTTP ${response.status} step=${body.step ?? "build"}`);
  return { response, payload };
}

async function fetchStatus() {
  const { response, payload } = await postCron({ step: "status" });
  if (!response.ok) {
    throw new Error(`status failed HTTP ${response.status}`);
  }
  return payload;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 失敗カテゴリだけ同夜に最大 RETRY_PASSES 回再試行 */
async function enrichAllCategories() {
  let pending = [...CATEGORIES];
  const allErrors = [];

  for (let pass = 1; pass <= RETRY_PASSES; pass += 1) {
    const still = [];
    console.log(`[works-news] enrich pass ${pass}/${RETRY_PASSES} categories=${pending.join(",")}`);
    for (const category of pending) {
      const { response, payload } = await postCron({ step: "enrich", category });
      if (!response.ok || payload.ok !== true) {
        const err = `${category}: ${payload.error ?? `HTTP ${response.status}`}`;
        allErrors.push(`pass${pass}/${err}`);
        still.push(category);
        console.error(`[works-news] enrich fail`, err);
        continue;
      }
      console.log(
        `[works-news] enrich ok ${category} count=${payload.enrichedCount} status=${payload.enrichmentStatus}`,
      );
    }
    pending = still;
    if (pending.length === 0) break;
    if (pass < RETRY_PASSES) {
      console.log(`[works-news] retry delay ${RETRY_DELAY_MS}ms before pass ${pass + 1}`);
      await sleep(RETRY_DELAY_MS);
    }
  }

  const status = await fetchStatus();
  if (
    status.enrichmentOk !== true ||
    status.enrichmentStatus !== "complete" ||
    status.isToday !== true ||
    status.digestId !== status.expectedDigestId
  ) {
    const detail = `enrichment incomplete status=${status.enrichmentStatus} isToday=${status.isToday} digestId=${status.digestId} expected=${status.expectedDigestId} pending=${pending.join(",") || "?"} errors=${allErrors.join(" | ") || "none"}`;
    if (softIncomplete) {
      console.warn(`[works-news] SOFT incomplete (will retry later / morning-gate): ${detail}`);
      return { complete: false, status };
    }
    throw new Error(detail);
  }
  console.log("[works-news] enrichment complete", status.digestId);
  return { complete: true, status };
}

function isTodayComplete(status) {
  // 旧 status（isToday 無し）はスキップ禁止 — 次定時の誤スキップ再発防止
  if (typeof status.isToday !== "boolean") return false;
  if (typeof status.expectedDigestId !== "string") return false;
  return (
    status.enrichmentOk === true &&
    status.enrichmentStatus === "complete" &&
    status.isToday === true &&
    status.digestId === status.expectedDigestId
  );
}

async function main() {
  if (enrichOnly) {
    console.log("[works-news] enrich-only mode");
    const status = await fetchStatus();
    if (isTodayComplete(status)) {
      console.log("[works-news] already complete", status.digestId);
      return;
    }
    if (status.reason === "today-missing" || !status.digestId) {
      throw new Error(
        "enrich-only には当日 digest が必要です。先に full（--force）を実行してください。",
      );
    }
    await enrichAllCategories();
    console.log("[works-news] enrich-only pipeline ok");
    return;
  }

  // 完了済みの当日分を毎時枠で再 build→再 enrich すると OpenAI 課金が爆発する。
  // --force のときだけ上書き再生成を許可する。
  // 昨日の complete を enrichmentOk と誤認してスキップしない（isToday 必須）。
  if (!force) {
    try {
      const status = await fetchStatus();
      if (isTodayComplete(status)) {
        console.log(
          "[works-news] already complete — skip build/enrich",
          status.digestId,
        );
        return;
      }
      // enrichmentStatus=partial でも「カテゴリ自体が空」のときは RSS 再収集が必要。
      // enrich-only では空配列は埋まらない（セキュリティ未収集の再発クラス）。
      if (
        status.digestId &&
        status.isToday === true &&
        status.enrichmentStatus === "partial" &&
        status.needsEnrichment === true &&
        status.reason !== "empty-categories"
      ) {
        const counts = status.counts && typeof status.counts === "object" ? status.counts : null;
        const emptyCats = counts
          ? CATEGORIES.filter((c) => !counts[c])
          : Array.isArray(status.emptyCategories)
            ? status.emptyCategories
            : [];
        if (emptyCats.length === 0) {
          console.log(
            "[works-news] incomplete digest — enrich-only (preserve existing AI fields)",
            status.digestId,
            status.enrichmentStatus,
          );
          await enrichAllCategories();
          console.log("[works-news] enrich-only recovery ok");
          return;
        }
        console.log(
          "[works-news] empty categories — full rebuild required",
          emptyCats.join(","),
        );
      }
      console.log(
        "[works-news] today not complete — full build",
        status.digestId ?? "(none)",
        status.reason ?? status.enrichmentStatus,
      );
    } catch (error) {
      console.warn(
        "[works-news] status check failed, continuing full pipeline:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  const { response, payload } = await postCron({ step: "build", force: true });
  if (!response.ok || payload.ok !== true) {
    throw new Error(
      `build failed HTTP ${response.status}: ${payload.error ?? JSON.stringify(payload).slice(0, 240)}`,
    );
  }
  console.log(
    "[works-news] build ok",
    payload.digestId,
    JSON.stringify(payload.counts ?? {}),
  );
  const emptyAfterBuild = CATEGORIES.filter((c) => !(payload.counts?.[c] > 0));
  if (emptyAfterBuild.length > 0) {
    throw new Error(
      `build left empty categories: ${emptyAfterBuild.join(",")} counts=${JSON.stringify(payload.counts ?? {})}`,
    );
  }
  await enrichAllCategories();
  console.log("[works-news] pipeline ok", payload.digestId);
}

await main();
