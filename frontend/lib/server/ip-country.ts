import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  lookupIpCountry,
  parseIpCountryTable,
  type IpCountryTable,
} from "@/lib/ip-country-lookup";

const ASSET_PATH = "/vendor/geo/ip-country.bin";
const FALLBACK_ORIGIN = "https://www.aquacore.net";
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

async function loadFromOrigin(origin: string): Promise<IpCountryTable | null> {
  const res = await fetch(`${origin.replace(/\/$/, "")}${ASSET_PATH}`, {
    signal: AbortSignal.timeout(8_000),
    cache: "no-store",
  });
  const type = res.headers.get("content-type") ?? "";
  // 認証リダイレクトの HTML を地理表と誤認しない
  if (!res.ok || type.includes("text/html")) return null;
  return parseIpCountryTable(await res.arrayBuffer());
}

function getTable(origin: string | null): Promise<IpCountryTable | null> {
  if (tablePromise) return tablePromise;
  if (failedAt && Date.now() - failedAt < RETRY_AFTER_FAIL_MS) return Promise.resolve(null);
  tablePromise = (async () => {
    const local = await loadFromFs();
    if (local) return local;
    for (const o of [origin, process.env.PRODUCTION_URL, FALLBACK_ORIGIN]) {
      if (!o) continue;
      try {
        const t = await loadFromOrigin(o);
        if (t) return t;
      } catch {
        // 次の候補へ
      }
    }
    return null;
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
export async function resolveIpCountry(
  ip: string | null | undefined,
  origin: string | null = null,
): Promise<string | null> {
  if (!ip || ip === "unknown") return null;
  try {
    const table = await Promise.race([
      getTable(origin),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3_000)),
    ]);
    return table ? lookupIpCountry(table, ip) : null;
  } catch {
    return null;
  }
}
