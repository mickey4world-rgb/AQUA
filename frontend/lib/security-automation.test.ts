// 完全架空・実在組織／人名禁止
import assert from "node:assert/strict";
import { isCloudflareIp, isIndividualPublicIp, normalizeIp, resolveClientIp } from "./client-ip";
import {
  LATEST_ALIAS,
  chooseModel,
  nextFlashCandidates,
  parseFlashModel,
  probeCandidates,
} from "./ai-model-selection";
import {
  AUTOBLOCK_FIRST_BLOCK_MS,
  AUTOBLOCK_REPEAT_BLOCK_MS,
  AUTOBLOCK_SCORE_THRESHOLD,
  AUTOBLOCK_WINDOW_MS,
  decideAutoBlock,
  securityEventWeight,
  slideAutoBlockScore,
  type AutoBlockHit,
} from "./security-autoblock";
import {
  assessSecurityFindings,
  dedupeFindings,
  fallbackTriageActions,
  normalizeSeverity,
  type TriageCollection,
  type TriageFinding,
} from "./security-triage";

// --- 送信元 IP ---
assert.equal(normalizeIp("203.0.113.7:51234"), "203.0.113.7");
assert.equal(normalizeIp("[2001:db8::1]:443"), "2001:db8::1");
assert.equal(normalizeIp("198.51.100.2, 10.0.0.1"), "198.51.100.2");
assert.equal(isCloudflareIp("104.16.1.1"), true);
assert.equal(isCloudflareIp("2606:4700:10::1"), true);
assert.equal(isCloudflareIp("203.0.113.7"), false);

const h = (init: Record<string, string>) => new Headers(init);
assert.equal(resolveClientIp(h({ "x-azure-clientip": "203.0.113.7" })), "203.0.113.7");
// Cloudflare 経由なら本当の送信元を使う
assert.equal(
  resolveClientIp(h({ "x-azure-clientip": "172.70.1.1", "cf-connecting-ip": "198.51.100.9" })),
  "198.51.100.9",
);
// Cloudflare 以外からの cf-connecting-ip は偽装として無視
assert.equal(
  resolveClientIp(h({ "x-azure-clientip": "203.0.113.7", "cf-connecting-ip": "198.51.100.9" })),
  "203.0.113.7",
);
assert.equal(resolveClientIp(h({})), "unknown");
// 不明・社内 IP は自動ブロックの識別に使わない（全員巻き添え防止）
assert.equal(isIndividualPublicIp("unknown"), false);
assert.equal(isIndividualPublicIp("10.1.2.3"), false);
assert.equal(isIndividualPublicIp("192.168.0.5"), false);
assert.equal(isIndividualPublicIp("203.0.113.7"), true);
assert.equal(isIndividualPublicIp("2001:db8::1"), true);

// --- 自動ブロック ---
const w401 = securityEventWeight({ eventType: "auth_denied", severity: "medium", statusCode: 401 });
const wCron = securityEventWeight({ eventType: "automation_auth_denied", severity: "high", statusCode: 401 });
assert.equal(securityEventWeight({ eventType: "auto_blocked", severity: "high", statusCode: 403 }), 0);
assert.equal(securityEventWeight({ eventType: "invalid_request", severity: "low", statusCode: 400 }), 0.5);

// 本人のセッション切れ: 10分で 20 回の 401 ではブロックされない
{
  const hits: AutoBlockHit[] = [];
  const t0 = 1_000_000;
  for (let i = 0; i < 20; i += 1) hits.push({ at: t0 + i * 1000, weight: w401 });
  const score = slideAutoBlockScore(hits, t0 + 20_000);
  assert.equal(decideAutoBlock({ score, blockedWithin24h: false }).block, false);
}
// 秘密の総当たり: 12 回でブロック、初回 1 時間・再発 24 時間
{
  const hits: AutoBlockHit[] = [];
  const t0 = 2_000_000;
  for (let i = 0; i < Math.ceil(AUTOBLOCK_SCORE_THRESHOLD / wCron); i += 1) {
    hits.push({ at: t0 + i * 500, weight: wCron });
  }
  const score = slideAutoBlockScore(hits, t0 + 10_000);
  const first = decideAutoBlock({ score, blockedWithin24h: false });
  assert.equal(first.block, true);
  assert.equal(first.block && first.durationMs, AUTOBLOCK_FIRST_BLOCK_MS);
  const repeat = decideAutoBlock({ score, blockedWithin24h: true });
  assert.equal(repeat.block && repeat.durationMs, AUTOBLOCK_REPEAT_BLOCK_MS);
}
// ウィンドウ外の古いヒットは数えない
{
  const hits: AutoBlockHit[] = [{ at: 0, weight: 100 }, { at: AUTOBLOCK_WINDOW_MS + 5, weight: 1 }];
  assert.equal(slideAutoBlockScore(hits, AUTOBLOCK_WINDOW_MS + 10), 1);
  assert.equal(hits.length, 1);
}

// --- 日次診断 ---
const now = new Date("2026-11-02T00:00:00Z");
const allOk: TriageCollection[] = [
  { source: "npm-audit", ok: true, count: 0 },
  { source: "dependabot", ok: true, count: 0 },
  { source: "code-scanning", ok: true, count: 0 },
  { source: "secret-scanning", ok: true, count: 0 },
];
const base = { collections: allOk, openSecurityPrs: [], events: null, now };

assert.equal(normalizeSeverity("moderate"), "medium");
assert.equal(normalizeSeverity("error"), "high");

// 何もなければ ok
assert.equal(assessSecurityFindings({ ...base, findings: [] }).level, "ok");

// 修正版ありの high が 30 時間放置 → critical
const overdueHigh: TriageFinding = {
  source: "dependabot",
  id: "GHSA-sample-0001",
  title: "サンプル脆弱性",
  severity: "high",
  packageName: "sample-lib",
  fixAvailable: true,
  firstSeenAt: "2026-11-01T18:00:00Z",
};
assert.equal(
  assessSecurityFindings({ ...base, findings: [{ ...overdueHigh, firstSeenAt: "2026-10-31T18:00:00Z" }] }).level,
  "critical",
);
// 出たばかり（6時間）の high は warn
assert.equal(assessSecurityFindings({ ...base, findings: [overdueHigh] }).level, "warn");
// 修正版なしの high は放置扱いにしないが warn、対処は回避策
{
  const noFix = { ...overdueHigh, fixAvailable: false, firstSeenAt: "2026-10-20T00:00:00Z" };
  const a = assessSecurityFindings({ ...base, findings: [noFix] });
  assert.equal(a.level, "warn");
  assert.match(fallbackTriageActions(a)[0].title, /回避策/);
}
// 秘密情報の検出は即 critical
assert.equal(
  assessSecurityFindings({
    ...base,
    findings: [{ source: "secret-scanning", id: "1", title: "sample token", severity: "unknown" }],
  }).level,
  "critical",
);
// 情報源が1つでも取れなければ「問題なし」と言わない
{
  const a = assessSecurityFindings({
    ...base,
    findings: [],
    collections: [...allOk.slice(1), { source: "npm-audit", ok: false, count: 0, error: "timeout" }],
  });
  assert.equal(a.level, "warn");
  assert.deepEqual(a.incompleteSources, ["npm-audit"]);
}
// npm audit と Dependabot の重複は 1 件にまとめ、経過時間がある方を残す
{
  const deduped = dedupeFindings([
    { ...overdueHigh, source: "npm-audit", firstSeenAt: null },
    overdueHigh,
  ]);
  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].firstSeenAt, overdueHigh.firstSeenAt);
}
// 自動ブロックが発生した日は warn
assert.equal(
  assessSecurityFindings({
    ...base,
    findings: [],
    events: { total: 40, high: 5, autoBlocked: 1, topTargets: [] },
  }).level,
  "warn",
);

// トークン未接続の任意情報源はレベルを上げない
assert.equal(
  assessSecurityFindings({
    ...base,
    findings: [],
    collections: [
      allOk[0],
      allOk[2],
      { source: "dependabot", ok: false, optional: true, count: 0, error: "未接続" },
      { source: "secret-scanning", ok: false, optional: true, count: 0, error: "未接続" },
    ],
  }).level,
  "ok",
);

// --- AI モデルの自動選定 ---
assert.deepEqual(parseFlashModel("gemini-3.6-flash"), { major: 3, minor: 6, lite: false });
assert.equal(parseFlashModel("gemini-flash-latest"), null);
assert.deepEqual(nextFlashCandidates(["gemini-3.6-flash", "gemini-flash-latest"]), [
  "gemini-3.7-flash",
  "gemini-3.8-flash",
  "gemini-4.0-flash",
]);
{
  const candidates = probeCandidates(["gemini-flash-latest", "gemini-3.6-flash"], null);
  assert.ok(candidates.includes("gemini-3.7-flash"));
  assert.ok(candidates.includes(LATEST_ALIAS));
  assert.ok(candidates.length <= 6);
}
// 新しい版が無料枠で応答したら切り替える
assert.equal(
  chooseModel(
    [
      { model: "gemini-3.7-flash", ok: true, latencyMs: 900 },
      { model: "gemini-3.6-flash", ok: true, latencyMs: 800 },
      { model: "gemini-4.0-flash", ok: false, latencyMs: 300, reason: "404" },
      { model: LATEST_ALIAS, ok: true, latencyMs: 700 },
    ],
    "gemini-3.6-flash",
  ),
  "gemini-3.7-flash",
);
// 版番号付きが全滅ならエイリアス、lite は最後の手段、全滅なら前回を維持
assert.equal(
  chooseModel(
    [
      { model: "gemini-3.7-flash", ok: false, latencyMs: 1 },
      { model: LATEST_ALIAS, ok: true, latencyMs: 1 },
      { model: "gemini-3.6-flash-lite", ok: true, latencyMs: 1 },
    ],
    null,
  ),
  LATEST_ALIAS,
);
assert.equal(chooseModel([{ model: "gemini-3.7-flash", ok: false, latencyMs: 1 }], "gemini-3.6-flash"), "gemini-3.6-flash");

console.log("security-automation tests passed");
