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
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchKabuToken, loadConfig } from "./kabu.mjs";

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

function buildCashOrder(intent) {
  const qty = Math.min(intent.qty, maxQty);
  const isSell = intent.side === "sell";
  return {
    Password: tradePassword,
    Symbol: String(intent.symbol),
    Exchange: Number(intent.exchange) || 1,
    SecurityType: 1,
    Side: isSell ? "1" : "2",
    CashMargin: 1,
    DelivType: isSell ? 0 : 2,
    FundType: isSell ? "  " : "AA",
    AccountType: Number(process.env.KABU_ACCOUNT_TYPE ?? 4) || 4,
    Qty: qty,
    FrontOrderType: 10,
    Price: 0,
    ExpireDay: 0,
  };
}

async function sendOrder(baseUrl, token, orderBody) {
  const res = await fetch(`${baseUrl}/kabusapi/sendorder`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": token,
    },
    body: JSON.stringify(orderBody),
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

console.log(
  `[kabu-bridge] trade start live=${allowLive ? "YES" : "NO (dry-run)"} maxQty=${maxQty}`,
);

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
if (allowLive) {
  token = await fetchKabuToken(config.kabuBaseUrl, config.apiPassword);
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
    });
    continue;
  }

  console.log(`[LIVE] ${sideLabel} ${intent.symbol} x${qty} ${ruleLabel}`);
  const result = await sendOrder(config.kabuBaseUrl, token, orderBody);
  const orderId =
    result.body?.OrderId ?? result.body?.orderId ?? result.body?.Result ?? undefined;
  await reportOrder({
    userId: config.aquaUserId,
    intentId: intent.id,
    side: intent.side,
    symbol: intent.symbol,
    exchange: orderBody.Exchange,
    qty,
    status: result.ok ? "submitted" : "rejected",
    dryRun: false,
    reason: intent.reason,
    ruleIds: intent.ruleIds,
    kabuOrderId: orderId != null ? String(orderId) : undefined,
    kabuResultCode: result.body?.Code ?? result.status,
    message: result.ok
      ? "sendorder accepted"
      : JSON.stringify(result.body).slice(0, 300),
  });
  if (!result.ok) {
    console.error("[LIVE] rejected", result.status, result.body);
  } else {
    console.log("[LIVE] submitted", orderId ?? result.body);
  }
}

console.log("[kabu-bridge] trade done");
