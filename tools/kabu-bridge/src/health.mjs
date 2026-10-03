/**
 * 株ステーション到達性・トークン可否だけを AQUA に報告。
 * sync 失敗時でも携帯から「ログインできているか」が分かる。
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchKabuToken, loadConfig } from "./kabu.mjs";
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
console.log(`[kabu-bridge] health check → ${config.kabuBaseUrl}`);

const stationReachable = await probeStationHttp(config.kabuBaseUrl);
let stationTokenOk = false;
let lastError = null;

if (!stationReachable) {
  lastError = "kabu HTTP に届かない（未起動・未ログイン・ポート違い）";
} else {
  try {
    await fetchKabuToken(config.kabuBaseUrl, config.apiPassword);
    stationTokenOk = true;
  } catch (err) {
    lastError =
      err instanceof Error ? err.message : "kabu token failed";
  }
}

const ok = await reportBridgeHealth(config, {
  stationReachable,
  stationTokenOk,
  lastError,
});
process.exit(ok && stationTokenOk ? 0 : 1);
