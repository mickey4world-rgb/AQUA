/**
 * 接続プローブ — トークン取得と余力だけ確認（AQUA へは送らない）
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchKabuToken, kabuGet, loadConfig } from "./kabu.mjs";

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
console.log(`probe: ${config.kabuBaseUrl}`);
const token = await fetchKabuToken(config.kabuBaseUrl, config.apiPassword);
console.log("token: ok");
const cash = await kabuGet(config.kabuBaseUrl, token, "/kabusapi/wallet/cash");
console.log(
  "cash StockAccountWallet:",
  cash?.StockAccountWallet ?? "(missing)",
);
console.log("probe ok");
