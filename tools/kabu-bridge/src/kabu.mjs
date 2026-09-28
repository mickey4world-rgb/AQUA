/**
 * kabuステーション API 共通 — トークン取得と GET
 * 発注エンドポイントは意図的に含めない（Phase1）
 */

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} が .env にありません`);
  }
  return value;
}

export function loadConfig() {
  return {
    kabuBaseUrl: (process.env.KABU_BASE_URL ?? "http://localhost:18080").replace(
      /\/$/,
      "",
    ),
    apiPassword: requireEnv("KABU_API_PASSWORD"),
    aquaBridgeUrl: (process.env.AQUA_BRIDGE_URL ?? "https://www.aquacore.net").replace(
      /\/$/,
      "",
    ),
    aquaBridgeSecret: requireEnv("AQUA_BRIDGE_SECRET"),
    aquaUserId: requireEnv("AQUA_USER_ID"),
  };
}

export async function fetchKabuToken(baseUrl, apiPassword) {
  const res = await fetch(`${baseUrl}/kabusapi/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ APIPassword: apiPassword }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.Token) {
    throw new Error(
      `kabu token failed: HTTP ${res.status} ${JSON.stringify(body).slice(0, 200)}`,
    );
  }
  return body.Token;
}

export async function kabuGet(baseUrl, token, path) {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { "X-API-KEY": token },
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  if (!res.ok) {
    throw new Error(`kabu GET ${path} failed: HTTP ${res.status}`);
  }
  return body;
}

/** 保有・余力を AQUA 用の正規化形に変換（証券ブランド名は載せない） */
export function normalizeSnapshot(userId, cash, positions) {
  const positionList = Array.isArray(positions) ? positions : [];
  const holdings = positionList.map((p) => ({
    symbol: String(p.Symbol ?? ""),
    symbolName: String(p.SymbolName ?? ""),
    exchange: Number(p.Exchange ?? 0),
    qty: Number(p.LeavesQty ?? p.HoldingsQty ?? 0),
    price: Number(p.Price ?? p.CurrentPrice ?? 0),
    side: p.Side != null ? String(p.Side) : undefined,
    accountType: p.AccountType != null ? Number(p.AccountType) : undefined,
  }));

  return {
    userId,
    broker: "kabu",
    syncedAt: new Date().toISOString(),
    cash: {
      stockAccountWallet: Number(cash?.StockAccountWallet ?? 0),
      auKCStockAuShareWallet: Number(cash?.AuKCStockAuShareWallet ?? 0),
      auPayCardWallet: Number(cash?.AuPayCardWallet ?? 0),
    },
    holdings,
    rawPositionCount: holdings.length,
  };
}
