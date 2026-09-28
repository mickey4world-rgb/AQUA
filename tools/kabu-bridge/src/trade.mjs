/**
 * Phase C — 現物売りインテントを取得し、dry-run または sendorder
 *
 * 安全装置:
 * - KABU_ALLOW_LIVE_ORDERS=1 が無い限り絶対に sendorder しない
 * - ホワイトリスト KABU_SYMBOL_WHITELIST（カンマ区切り）。空なら全JP売り候補
 * - KABU_MAX_QTY_PER_ORDER（既定 100）
 * - 買い・信用は実装しない
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
const maxQty = Math.max(1, Number(process.env.KABU_MAX_QTY_PER_ORDER ?? 100) || 100);
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

function buildCashSellOrder(intent) {
  const qty = Math.min(intent.qty, maxQty);
  return {
    Password: tradePassword,
    Symbol: String(intent.symbol),
    Exchange: Number(intent.exchange) || 1,
    SecurityType: 1,
    Side: "1", // 売
    CashMargin: 1, // 現物
    DelivType: 0,
    FundType: "  ", // 現物売: 半角スペース2つ
    AccountType: Number(process.env.KABU_ACCOUNT_TYPE ?? 4) || 4,
    Qty: qty,
    FrontOrderType: 10, // 成行
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
console.log(
  `[kabu-bridge] intents=${intents.length} sessionGuess=${intentPayload.sessionOpenGuess}`,
);

if (intents.length === 0) {
  console.log("[kabu-bridge] nothing to do");
  process.exit(0);
}

let token = null;
if (allowLive) {
  token = await fetchKabuToken(config.kabuBaseUrl, config.apiPassword);
}

for (const intent of intents) {
  if (intent.side !== "sell") {
    console.log(`[skip] buy not supported yet ${intent.symbol}`);
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
      message: "KABU_SYMBOL_WHITELIST 外",
    });
    continue;
  }

  const orderBody = buildCashSellOrder(intent);
  const qty = orderBody.Qty;

  if (!allowLive) {
    console.log(
      `[dry-run] SELL ${intent.symbol} x${qty} exch=${orderBody.Exchange} — ${intent.reason}`,
    );
    await reportOrder({
      userId: config.aquaUserId,
      intentId: intent.id,
      side: "sell",
      symbol: intent.symbol,
      exchange: orderBody.Exchange,
      qty,
      status: "dry_run",
      dryRun: true,
      reason: intent.reason,
      message: "KABU_ALLOW_LIVE_ORDERS 未設定のため未発注",
    });
    continue;
  }

  console.log(`[LIVE] SELL ${intent.symbol} x${qty}`);
  const result = await sendOrder(config.kabuBaseUrl, token, orderBody);
  const orderId =
    result.body?.OrderId ?? result.body?.orderId ?? result.body?.Result ?? undefined;
  await reportOrder({
    userId: config.aquaUserId,
    intentId: intent.id,
    side: "sell",
    symbol: intent.symbol,
    exchange: orderBody.Exchange,
    qty,
    status: result.ok ? "submitted" : "rejected",
    dryRun: false,
    reason: intent.reason,
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
