/**
 * VM 自動判断の結果を AQUA health に載せる（発注なし）。
 * Env: KABU_RECOVERY_STATUS / ACTION / TOKEN_OK / REACHABLE / ERROR
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./kabu.mjs";
import { reportBridgeHealth } from "./report-health.mjs";

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

const status = (process.env.KABU_RECOVERY_STATUS ?? "unknown").trim();
const action = (process.env.KABU_RECOVERY_ACTION ?? "").trim();
const tokenOk = process.env.KABU_RECOVERY_TOKEN_OK?.trim() === "1";
const reachable =
  process.env.KABU_RECOVERY_REACHABLE?.trim() === "1" || tokenOk;
const errRaw = (process.env.KABU_RECOVERY_ERROR ?? "").trim();

const ok = await reportBridgeHealth(config, {
  stationReachable: reachable,
  stationTokenOk: tokenOk,
  lastError: tokenOk
    ? null
    : errRaw || `recovery=${status} action=${action}`,
  recoveryStatus: status,
  recoveryAction: action || undefined,
  recoveryAt: new Date().toISOString(),
});

console.log(
  `[kabu-bridge] recovery report status=${status} action=${action} token=${tokenOk} ok=${ok}`,
);
process.exit(ok ? 0 : 1);
