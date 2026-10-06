/**
 * OTP / 緑マーク後までトークン取得を待つ。
 * 朝のログオン直後は未ログインで失敗するのが普通なので、成功するまでリトライしてから exit 0。
 * GUI 緑なのに token が取れないときはステーション再起動を促す。
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

const maxWaitMin = Math.max(
  1,
  Number(process.env.KABU_WAIT_READY_MINUTES ?? 90),
);
const intervalSec = Math.max(
  15,
  Number(process.env.KABU_WAIT_READY_INTERVAL_SEC ?? 45),
);
const deadline = Date.now() + maxWaitMin * 60_000;
const config = loadConfig();

console.log(
  `[kabu-bridge] wait-ready → ${config.kabuBaseUrl} (max ${maxWaitMin}m, every ${intervalSec}s)`,
);

let attempts = 0;
let reachableFailStreak = 0;
let tokenFailWhileReachable = 0;

while (Date.now() < deadline) {
  attempts += 1;
  const stationReachable = await probeStationHttp(config.kabuBaseUrl);
  try {
    if (!stationReachable) {
      reachableFailStreak += 1;
      tokenFailWhileReachable = 0;
      const lastError =
        "station HTTP unreachable（未起動・ポート違い・セッション切断の疑い）";
      await reportBridgeHealth(config, {
        stationReachable: false,
        stationTokenOk: false,
        lastError,
      });
      console.log(`[kabu-bridge] wait-ready #${attempts}: ${lastError}`);
    } else {
      reachableFailStreak = 0;
      await fetchKabuToken(config.kabuBaseUrl, config.apiPassword);
      await reportBridgeHealth(config, {
        stationReachable: true,
        stationTokenOk: true,
        lastError: null,
      });
      console.log(
        `[kabu-bridge] wait-ready OK after ${attempts} attempt(s) — token green`,
      );
      process.exit(0);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (stationReachable) tokenFailWhileReachable += 1;
    let lastError = message;
    if (tokenFailWhileReachable >= 3) {
      lastError =
        `${message} | GUI緑でもAPIが応答しないときは株ステーションを再起動してから Sync-Now.cmd`;
    }
    await reportBridgeHealth(config, {
      stationReachable,
      stationTokenOk: false,
      lastError,
    });
    console.log(`[kabu-bridge] wait-ready #${attempts}: ${lastError}`);
  }

  const remainMs = deadline - Date.now();
  if (remainMs <= 0) break;
  await new Promise((r) =>
    setTimeout(r, Math.min(intervalSec * 1000, remainMs)),
  );
}

const tip =
  reachableFailStreak > 0
    ? "ステーション未起動 or RDP×切断でデスクトップ死亡の疑い。tscon 切断を使う。"
    : "OTP未完了、APIパスワード不一致、または緑アイコンなのにAPI固まり（再起動が必要）。";
console.error(`[kabu-bridge] wait-ready TIMEOUT after ${attempts} attempts — ${tip}`);
process.exit(1);
