/**
 * Phase1 sync — 余力・保有を AQUA に POST（発注なし）
 * 失敗時も health を送り、外出先でステーション状態を確認できるようにする。
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  fetchKabuToken,
  kabuGet,
  loadConfig,
  normalizeSnapshot,
} from "./kabu.mjs";
import { probeStationHttp, reportBridgeHealth } from "./report-health.mjs";

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
console.log(`[kabu-bridge] sync start → ${config.aquaBridgeUrl}`);

const stationReachable = await probeStationHttp(config.kabuBaseUrl);

try {
  const token = await fetchKabuToken(config.kabuBaseUrl, config.apiPassword);
  const [cash, positions] = await Promise.all([
    kabuGet(config.kabuBaseUrl, token, "/kabusapi/wallet/cash"),
    kabuGet(config.kabuBaseUrl, token, "/kabusapi/positions"),
  ]);

  const bridgeMeta = {
    allowLiveOrders: process.env.KABU_ALLOW_LIVE_ORDERS?.trim() === "1",
    kabuBaseUrl: config.kabuBaseUrl,
    kabuPort: Number(new URL(config.kabuBaseUrl).port) || undefined,
    stationReachable: true,
    stationTokenOk: true,
    lastError: null,
    healthReportedAt: new Date().toISOString(),
  };

  const snapshot = normalizeSnapshot(
    config.aquaUserId,
    cash,
    positions,
    bridgeMeta,
  );

  const res = await fetch(`${config.aquaBridgeUrl}/api/stocks/broker/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.aquaBridgeSecret}`,
    },
    body: JSON.stringify(snapshot),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    await reportBridgeHealth(config, {
      stationReachable: true,
      stationTokenOk: true,
      lastError: `AQUA sync HTTP ${res.status}`,
    });
    console.error("[kabu-bridge] AQUA sync failed", res.status, body);
    process.exit(1);
  }

  await reportBridgeHealth(config, {
    stationReachable: true,
    stationTokenOk: true,
    lastError: null,
  });

  console.log(
    `[kabu-bridge] ok holdings=${snapshot.holdings.length} cash=${snapshot.cash.stockAccountWallet} id=${body.id ?? "?"}`,
  );
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  await reportBridgeHealth(config, {
    stationReachable,
    stationTokenOk: false,
    lastError: message,
  });
  console.error("[kabu-bridge] sync failed:", message);
  process.exit(1);
}
