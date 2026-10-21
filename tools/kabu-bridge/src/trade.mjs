/**
 * Phase C2 — 現物の売り/買いインテントを取得し、dry-run または sendorder
 *
 * 安全装置:
 * - KABU_ALLOW_LIVE_ORDERS=1 が無い限り絶対に sendorder しない
 * - LIVE は sessionOpenGuess（発注窓）が true のときだけ sendorder
 * - ホワイトリスト KABU_SYMBOL_WHITELIST（カンマ区切り）。空なら全JP候補
 * - KABU_MAX_QTY_PER_ORDER（既定 100）
 * - 信用は実装しない
 * - intents=0 でも buySkips 要約を点検レコードに残す（運用オラクル）
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchKabuToken, kabuGet, loadConfig } from "./kabu.mjs";
import {
  assertCashOrderShape,
  normalizeCashExchange,
  applyKnownRejectFixes,
} from "./cash-order-shape.mjs";

const SETUP_DIR = process.env.KABU_SETUP_DIR?.trim() || "C:\\kabu-setup";
const LEARN_PATH = join(SETUP_DIR, "order-defaults.json");
const REJECT_STORM_PATH = join(SETUP_DIR, "reject-storm.json");

function loadDotEnv() {
  const dir = dirname(fileURLToPath(import.meta.url));
  const envPath = join(dir, "..", ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadDotEnv();

// .env poison: KABU_EXCHANGE=1 still produces 100378 even after remap helpers.
if (String(process.env.KABU_EXCHANGE ?? "").trim() === "1") {
  console.warn("[kabu-bridge] KABU_EXCHANGE=1 is banned for cash; overriding to 27");
  process.env.KABU_EXCHANGE = "27";
}
if (
  String(process.env.KABU_FUND_TYPE ?? "").trim() === "AA" &&
  process.env.KABU_ALLOW_CREDIT_FUND?.trim() !== "1"
) {
  console.warn("[kabu-bridge] KABU_FUND_TYPE=AA without credit opt-in; overriding to 02");
  process.env.KABU_FUND_TYPE = "02";
}

const config = loadConfig();
const allowLive = process.env.KABU_ALLOW_LIVE_ORDERS?.trim() === "1";
const tradePassword = process.env.KABU_TRADE_PASSWORD?.trim() ?? "";
const maxQty = Math.max(1, Number(process.env.KABU_MAX_QTY_PER_ORDER ?? 200) || 200);
const whitelist = (process.env.KABU_SYMBOL_WHITELIST ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function authHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.aquaBridgeSecret}`,
  };
}

async function fetchIntents() {
  const url = `${config.aquaBridgeUrl}/api/stocks/broker/intents?userId=${encodeURIComponent(config.aquaUserId)}`;
  const res = await fetch(url, { headers: authHeaders() });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`intents failed: ${res.status} ${JSON.stringify(body).slice(0, 200)}`);
  }
  return body;
}

async function reportOrder(payload) {
  const res = await fetch(`${config.aquaBridgeUrl}/api/stocks/broker/orders`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.warn("[trade] report failed", res.status, body);
  }
  return body;
}

function loadJson(path, fallback) {
  try {
    if (!existsSync(path)) return fallback;
    return { ...fallback, ...JSON.parse(readFileSync(path, "utf8")) };
  } catch {
    return fallback;
  }
}

function saveJson(path, obj) {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(obj, null, 2), "utf8");
  } catch (err) {
    console.warn("[trade] saveJson failed", path, err instanceof Error ? err.message : err);
  }
}

function loadLearnedDefaults() {
  const raw = loadJson(LEARN_PATH, { exchange: null, fundType: null, updatedAt: null });
  // Poisoned learn (Exchange=1 / FundType=AA) must not stick across days.
  let dirty = false;
  if (Number(raw.exchange) === 1) {
    raw.exchange = 27;
    dirty = true;
  }
  if (String(raw.fundType) === "AA" && process.env.KABU_ALLOW_CREDIT_FUND?.trim() !== "1") {
    raw.fundType = "02";
    dirty = true;
  }
  if (dirty) {
    saveJson(LEARN_PATH, { ...raw, updatedAt: new Date().toISOString(), healed: true });
  }
  return raw;
}

function rememberDefault(patch) {
  const cur = loadLearnedDefaults();
  const next = {
    ...cur,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  if (Number(next.exchange) === 1) next.exchange = 27;
  if (String(next.fundType) === "AA" && process.env.KABU_ALLOW_CREDIT_FUND?.trim() !== "1") {
    next.fundType = "02";
  }
  if (next.accountType != null) {
    const a = Number(next.accountType);
    if (a !== 2 && a !== 4) delete next.accountType;
  }
  saveJson(LEARN_PATH, next);
}

function jstDayKey() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" });
}

/** Same symbol+code rejected too many times today after autofix → stop hammering. */
function shouldStormSkip(symbol, code) {
  const st = loadJson(REJECT_STORM_PATH, { day: null, counts: {} });
  const day = jstDayKey();
  if (st.day !== day) return false;
  const key = `${symbol}:${code}`;
  return (st.counts[key] ?? 0) >= 3;
}

function bumpStorm(symbol, code) {
  const day = jstDayKey();
  const st = loadJson(REJECT_STORM_PATH, { day: null, counts: {} });
  if (st.day !== day) {
    st.day = day;
    st.counts = {};
  }
  const key = `${symbol}:${code}`;
  st.counts[key] = (st.counts[key] ?? 0) + 1;
  saveJson(REJECT_STORM_PATH, st);
  return st.counts[key];
}

function resolveBuyFundType() {
  // Official: no credit account → "02" (保護). "AA" (信用代用) → 100204.
  const learned = loadLearnedDefaults().fundType;
  const raw =
    (process.env.KABU_FUND_TYPE ?? learned ?? "02").toString().trim() || "02";
  if (raw === "AA" && process.env.KABU_ALLOW_CREDIT_FUND?.trim() !== "1") {
    console.warn(
      "[kabu-bridge] KABU_FUND_TYPE=AA ignored without KABU_ALLOW_CREDIT_FUND=1; using 02",
    );
    return "02";
  }
  return raw;
}

/**
 * Cash buy/sell: Exchange 1 (東証) banned since 2026-02-28 → 100378.
 * preferred=1 (bad .env / learned) must still resolve to 27 — see normalizeCashExchange.
 */
function resolveCashExchange(intentExchange) {
  const learned = loadLearnedDefaults().exchange;
  const envEx = Number(process.env.KABU_EXCHANGE ?? 0) || 0;
  const preferred = envEx || learned || 27;
  return normalizeCashExchange(intentExchange, preferred);
}

function buildCashOrder(intent) {
  const qty = Math.min(intent.qty, maxQty);
  const isSell = intent.side === "sell";
  const buyFundType = resolveBuyFundType();
  let buyDelivType = Number(process.env.KABU_DELIV_TYPE ?? 2) || 2;
  if (buyDelivType !== 2 && buyDelivType !== 3) buyDelivType = 2;
  return {
    Password: tradePassword,
    Symbol: String(intent.symbol),
    Exchange: resolveCashExchange(intent.exchange),
    SecurityType: 1,
    Side: isSell ? "1" : "2",
    CashMargin: 1,
    DelivType: isSell ? 0 : buyDelivType,
    FundType: isSell ? "  " : buyFundType,
    AccountType: (() => {
      const learnedAcct = Number(loadLearnedDefaults().accountType) || 0;
      const envAcct = Number(process.env.KABU_ACCOUNT_TYPE ?? 0) || 0;
      const a = envAcct || learnedAcct || 4;
      return a === 2 || a === 4 ? a : 4;
    })(),
    Qty: qty,
    FrontOrderType: 10,
    Price: 0,
    ExpireDay: 0,
  };
}

function applyRejectFix(orderBody, code) {
  return applyKnownRejectFixes(orderBody, code, rememberDefault);
}

function orderShapeForLog(orderBody) {
  return {
    Symbol: orderBody.Symbol,
    Side: orderBody.Side,
    CashMargin: orderBody.CashMargin,
    DelivType: orderBody.DelivType,
    FundType: orderBody.FundType,
    AccountType: orderBody.AccountType,
    Qty: orderBody.Qty,
    Exchange: orderBody.Exchange,
    FrontOrderType: orderBody.FrontOrderType,
  };
}

async function sendOrder(baseUrl, token, orderBody) {
  const timeoutMs = Number(process.env.KABU_FETCH_TIMEOUT_MS ?? 12_000);
  const res = await fetch(`${baseUrl}/kabusapi/sendorder`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": token,
    },
    body: JSON.stringify(orderBody),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

function summarizeBuySkips(buySkips, limit = 5) {
  if (!Array.isArray(buySkips) || buySkips.length === 0) return "";
  return buySkips
    .slice(0, limit)
    .map((s) => {
      const why = Array.isArray(s.reasons) ? s.reasons[0] : "";
      return `${s.symbol}:${why}`;
    })
    .join(" | ");
}

/**
 * 売り実現損益・単価を注文報告へ載せる（Costs の実現損益グラフ／表用）。
 * intent の見込み値を優先し、無ければ保有の平均取得×時価で補完。
 */
function pnlFieldsForIntent(intent, qty, positionsBySymbol) {
  const pos = positionsBySymbol?.get(String(intent.symbol));
  const cost =
    Number(intent.costPriceYen) ||
    Number(pos?.Price) ||
    0;
  const mark =
    Number(intent.refPriceYen) ||
    Number(pos?.CurrentPrice) ||
    0;
  const out = {};
  if (mark > 0) out.priceYen = mark;
  if (intent.side === "sell") {
    if (cost > 0) out.costPriceYen = cost;
    if (typeof intent.expectedRealizedPnlYen === "number") {
      out.realizedPnlYen = Math.round(intent.expectedRealizedPnlYen);
    } else if (cost > 0 && mark > 0 && qty > 0) {
      out.realizedPnlYen = Math.round((mark - cost) * qty);
    }
  }
  return out;
}

console.log(
  `[kabu-bridge] trade start live=${allowLive ? "YES" : "NO (dry-run)"} maxQty=${maxQty}`,
);

// Boot oracle: sample cash shapes must be legal before any intent loop.
{
  const probeBuy = buildCashOrder({
    side: "buy",
    symbol: "1301",
    exchange: 1,
    qty: 100,
  });
  const probeSell = buildCashOrder({
    side: "sell",
    symbol: "1301",
    exchange: 1,
    qty: 100,
  });
  const allowCredit = process.env.KABU_ALLOW_CREDIT_FUND?.trim() === "1";
  for (const [label, body] of [
    ["buy", probeBuy],
    ["sell", probeSell],
  ]) {
    const check = assertCashOrderShape(body, { allowCreditFund: allowCredit });
    if (!check.ok) {
      console.error(`[kabu-bridge] TRADE_SHAPE_BAD ${label}: ${check.errors.join("; ")}`);
      process.exit(1);
    }
  }
  console.log(
    `[kabu-bridge] TRADE_SHAPE_OK exch=${probeBuy.Exchange} fund=${JSON.stringify(probeBuy.FundType)} deliv=${probeBuy.DelivType}`,
  );
}

if (allowLive && !tradePassword) {
  console.error(
    "[kabu-bridge] KABU_ALLOW_LIVE_ORDERS=1 には KABU_TRADE_PASSWORD（取引パスワード）が必須です",
  );
  process.exit(1);
}

const intentPayload = await fetchIntents();
const intents = Array.isArray(intentPayload.intents) ? intentPayload.intents : [];
const buySkips = Array.isArray(intentPayload.buySkips) ? intentPayload.buySkips : [];
const sessionOpen = Boolean(intentPayload.sessionOpenGuess);
const skipSummary = summarizeBuySkips(buySkips);
console.log(
  `[kabu-bridge] intents=${intents.length} sessionGuess=${sessionOpen} buySkips=${buySkips.length} policy=${intentPayload.policy ?? "?"}`,
);
if (skipSummary) {
  console.log(`[kabu-bridge] buySkipsTop ${skipSummary}`);
}

const jstStamp = new Date().toLocaleString("sv-SE", {
  timeZone: "Asia/Tokyo",
  hour12: false,
});
const hourKey = jstStamp.slice(0, 13).replace(" ", "T");

if (intents.length === 0) {
  console.log("[kabu-bridge] nothing to do — report idle check");
  await reportOrder({
    id: `idle-${config.aquaUserId}-${hourKey}`,
    userId: config.aquaUserId,
    intentId: `idle-${hourKey}`,
    side: "buy",
    symbol: "_CHECK_",
    exchange: 1,
    qty: 0,
    status: "skipped",
    dryRun: !allowLive,
    reason: sessionOpen
      ? "条件未達・見送り（点検）"
      : "場外または条件未達・見送り（点検）",
    message: [
      `intents=0 sessionGuess=${sessionOpen} policy=${intentPayload.policy ?? "?"}`,
      skipSummary ? `buySkips=${skipSummary}` : "buySkips=none",
    ].join("; "),
  });
  process.exit(0);
}

// LIVE は発注窓のみ。窓外は dry-run 記録だけ（誤発注・場外拒否のノイズ防止）
if (allowLive && !sessionOpen) {
  console.log("[kabu-bridge] LIVE gated: outside trade window — report skip, no sendorder");
  for (const intent of intents) {
    await reportOrder({
      userId: config.aquaUserId,
      intentId: intent.id,
      side: intent.side,
      symbol: intent.symbol,
      exchange: intent.exchange,
      qty: intent.qty,
      status: "skipped",
      dryRun: false,
      reason: "場外・ブラックアウトのため LIVE 見送り",
      ruleIds: intent.ruleIds,
      message: `sessionOpenGuess=false; ${intent.reason ?? ""}`.slice(0, 300),
    });
  }
  await reportOrder({
    id: `idle-${config.aquaUserId}-${hourKey}`,
    userId: config.aquaUserId,
    intentId: `idle-${hourKey}`,
    side: "buy",
    symbol: "_CHECK_",
    exchange: 1,
    qty: 0,
    status: "skipped",
    dryRun: false,
    reason: "場外・ブラックアウト（点検）",
    message: `intents=${intents.length} held; LIVE gated; ${skipSummary || "buySkips=none"}`,
  });
  process.exit(0);
}

let token = null;
/** @type {Map<string, any>} */
let positionsBySymbol = new Map();
if (allowLive) {
  try {
    token = await fetchKabuToken(config.kabuBaseUrl, config.apiPassword);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[kabu-bridge] token failed — skip LIVE sendorder:", msg);
    await reportOrder({
      id: `idle-${config.aquaUserId}-${hourKey}`,
      userId: config.aquaUserId,
      intentId: `idle-${hourKey}`,
      side: "buy",
      symbol: "_CHECK_",
      exchange: 1,
      qty: 0,
      status: "skipped",
      dryRun: false,
      reason: "kabu token 取得失敗のため LIVE 見送り",
      message: `intents=${intents.length}; ${msg}`.slice(0, 300),
    });
    process.exit(1);
  }
  try {
    const positions = await kabuGet(config.kabuBaseUrl, token, "/kabusapi/positions");
    const list = Array.isArray(positions) ? positions : [];
    positionsBySymbol = new Map(
      list
        .filter((p) => p?.Symbol != null)
        .map((p) => [String(p.Symbol), p]),
    );
  } catch (err) {
    console.warn(
      "[kabu-bridge] positions fetch failed (PnL estimate may use intent only)",
      err instanceof Error ? err.message : err,
    );
  }
}

for (const intent of intents) {
  if (intent.side !== "sell" && intent.side !== "buy") {
    console.log(`[skip] unsupported side ${intent.side} ${intent.symbol}`);
    continue;
  }
  if (whitelist.length > 0 && !whitelist.includes(String(intent.symbol))) {
    console.log(`[skip] not in whitelist ${intent.symbol}`);
    await reportOrder({
      userId: config.aquaUserId,
      intentId: intent.id,
      side: intent.side,
      symbol: intent.symbol,
      exchange: intent.exchange,
      qty: intent.qty,
      status: "skipped",
      dryRun: !allowLive,
      reason: "whitelist",
      ruleIds: intent.ruleIds,
      message: "KABU_SYMBOL_WHITELIST 外",
    });
    continue;
  }

  const orderBody = buildCashOrder(intent);
  const qty = orderBody.Qty;
  const sideLabel = intent.side === "sell" ? "SELL" : "BUY";
  const ruleLabel = Array.isArray(intent.ruleIds)
    ? intent.ruleIds.map((n) => `#${n}`).join("+")
    : "";

  if (!allowLive) {
    console.log(
      `[dry-run] ${sideLabel} ${intent.symbol} x${qty} exch=${orderBody.Exchange} ${ruleLabel} — ${intent.reason}`,
    );
    await reportOrder({
      userId: config.aquaUserId,
      intentId: intent.id,
      side: intent.side,
      symbol: intent.symbol,
      exchange: orderBody.Exchange,
      qty,
      status: "dry_run",
      dryRun: true,
      reason: intent.reason,
      ruleIds: intent.ruleIds,
      message: "KABU_ALLOW_LIVE_ORDERS 未設定のため未発注",
      ...pnlFieldsForIntent(intent, qty, positionsBySymbol),
    });
    continue;
  }

  if (
    shouldStormSkip(String(intent.symbol), 100378) ||
    shouldStormSkip(String(intent.symbol), 100204) ||
    shouldStormSkip(String(intent.symbol), 100001) ||
    shouldStormSkip(String(intent.symbol), 100031) ||
    shouldStormSkip(String(intent.symbol), 32)
  ) {
    console.warn(
      `[LIVE] storm-skip ${intent.symbol} (same reject code 3+ today; waiting for next-day / manual review)`,
    );
    await reportOrder({
      userId: config.aquaUserId,
      intentId: intent.id,
      side: intent.side,
      symbol: intent.symbol,
      exchange: orderBody.Exchange,
      qty,
      status: "skipped",
      dryRun: false,
      reason: "同一拒否が続き自動停止（見直し待ち）",
      ruleIds: intent.ruleIds,
      message: "reject-storm skip; see C:\\kabu-setup\\reject-storm.json",
    });
    continue;
  }

  const shapeCheck = assertCashOrderShape(orderBody, {
    allowCreditFund: process.env.KABU_ALLOW_CREDIT_FUND?.trim() === "1",
  });
  if (!shapeCheck.ok) {
    console.error(
      `[LIVE] TRADE_SHAPE_BAD refuse sendorder ${intent.symbol}: ${shapeCheck.errors.join("; ")}`,
    );
    await reportOrder({
      userId: config.aquaUserId,
      intentId: intent.id,
      side: intent.side,
      symbol: intent.symbol,
      exchange: orderBody.Exchange,
      qty,
      status: "rejected",
      dryRun: false,
      reason: "発注形が現物不変条件を満たさない（API前に拒否）",
      ruleIds: intent.ruleIds,
      message: shapeCheck.errors.join("; ").slice(0, 300),
    });
    continue;
  }

  let result = null;
  const appliedFixes = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    console.log(
      `[LIVE] ${sideLabel} ${intent.symbol} x${qty} try=${attempt + 1} ${ruleLabel} shape=${JSON.stringify(orderShapeForLog(orderBody))}`,
    );
    result = await sendOrder(config.kabuBaseUrl, token, orderBody);
    if (result.ok) break;
    const code = result.body?.Code ?? result.status;
    if (shouldStormSkip(String(intent.symbol), code)) {
      console.warn(
        `[LIVE] storm-skip ${intent.symbol} code=${code} (already rejected 3+ today after review)`,
      );
      break;
    }
    const fixes = applyRejectFix(orderBody, code);
    if (fixes.length === 0) {
      console.error("[LIVE] rejected (no autofix)", result.status, result.body);
      break;
    }
    appliedFixes.push(...fixes);
    console.warn(`[LIVE] autofix then retry: ${fixes.join("; ")}`);
  }

  const orderId =
    result?.body?.OrderId ?? result?.body?.orderId ?? result?.body?.Result ?? undefined;
  const ok = Boolean(result?.ok);
  const code = result?.body?.Code ?? result?.status;
  if (!ok && code != null) bumpStorm(String(intent.symbol), code);

  await reportOrder({
    userId: config.aquaUserId,
    intentId: intent.id,
    side: intent.side,
    symbol: intent.symbol,
    exchange: orderBody.Exchange,
    qty,
    status: ok ? "submitted" : "rejected",
    dryRun: false,
    reason: intent.reason,
    ruleIds: intent.ruleIds,
    kabuOrderId: orderId != null ? String(orderId) : undefined,
    kabuResultCode: code,
    message: ok
      ? appliedFixes.length
        ? `sendorder accepted after autofix: ${appliedFixes.join("; ")}`
        : "sendorder accepted"
      : [
          JSON.stringify(result?.body ?? {}).slice(0, 220),
          appliedFixes.length ? `autofix=${appliedFixes.join("|")}` : "autofix=none",
        ].join("; "),
    ...(ok ? pnlFieldsForIntent(intent, qty, positionsBySymbol) : {}),
  });
  if (ok) {
    const pnl = pnlFieldsForIntent(intent, qty, positionsBySymbol);
    console.log(
      "[LIVE] submitted",
      orderId ?? result.body,
      intent.side === "sell" && pnl.realizedPnlYen != null
        ? `realizedPnlYen=${pnl.realizedPnlYen}`
        : "",
    );
  }
}

console.log("[kabu-bridge] trade done");
