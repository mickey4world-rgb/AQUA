import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  lookupIpCountry,
  parseIpCountryTable,
  type IpCountryTable,
} from "@/lib/ip-country-lookup";

/** 同梱表。リクエスト由来の origin では絶対に取得しない（SSRF 防止） */
const ASSET_URL = "https://www.aquacore.net/vendor/geo/ip-country.bin";
const RETRY_AFTER_FAIL_MS = 10 * 60_000;

let tablePromise: Promise<IpCountryTable | null> | null = null;
let failedAt = 0;

async function loadFromFs(): Promise<IpCountryTable | null> {
  try {
    const buf = await readFile(join(process.cwd(), "public", "vendor", "geo", "ip-country.bin"));
    return parseIpCountryTable(buf);
  } catch {
    return null;
  }
}

async function loadFromTrustedUrl(): Promise<IpCountryTable | null> {
  // URL は定数のみ。request.origin / PRODUCTION_URL など可変値は渡さない
  const res = await fetch(ASSET_URL, {
    signal: AbortSignal.timeout(8_000),
    cache: "no-store",
  });
  const type = res.headers.get("content-type") ?? "";
  // 認証リダイレクトの HTML を地理表と誤認しない
  if (!res.ok || type.includes("text/html")) return null;
  return parseIpCountryTable(await res.arrayBuffer());
}

function getTable(): Promise<IpCountryTable | null> {
  if (tablePromise) return tablePromise;
  if (failedAt && Date.now() - failedAt < RETRY_AFTER_FAIL_MS) return Promise.resolve(null);
  tablePromise = (async () => {
    const local = await loadFromFs();
    if (local) return local;
    try {
      return await loadFromTrustedUrl();
    } catch {
      return null;
    }
  })().then((t) => {
    if (!t) {
      failedAt = Date.now();
      tablePromise = null;
      console.warn("[ip-country] table unavailable; country stays null");
    }
    return t;
  });
  return tablePromise;
}

/** IP から国コードを引く（表が読めない間は null。呼び出しを止めない） */
export async function resolveIpCountry(ip: string | null | undefined): Promise<string | null> {
  if (!ip || ip === "unknown") return null;
  try {
    const table = await Promise.race([
      getTable(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3_000)),
    ]);
    return table ? lookupIpCountry(table, ip) : null;
  } catch {
    return null;
  }
}
