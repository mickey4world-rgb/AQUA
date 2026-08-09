/**
 * 企業住所の解決（国税庁 Web-API 不要）。
 *
 * 1. 行政事業レビュー同梱データ（支出先の所在地）
 * 2. OpenStreetMap Nominatim（レビューに無い／住所が無いとき）
 * 3. 任意で HOUJIN_BANGOU_APP_ID があれば法人番号 API
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import {
  isHoujinConfigured,
  parseJapanAddress,
  searchHoujinByName,
  type HoujinCompany,
} from "@/lib/server/houjin";
import type { GyoseiYearDataset } from "@/lib/types/gyosei";

export type ResolvedCompany = {
  name: string;
  corporateNumber: string;
  address: string;
  prefecture: string;
  city: string;
  source: "review" | "openstreetmap" | "houjin";
};

type PayeeProfile = {
  name: string;
  corporateNumber: string;
  address: string;
  amount: number;
};

const DATA_DIR = path.join(process.cwd(), "data", "gyosei");
let profileCache: Map<string, PayeeProfile> | null = null;

export function splitWorkAndAddress(work: string): { work: string; address: string } {
  const text = (work || "").trim();
  const idx = text.lastIndexOf(" / ");
  if (idx < 0) return { work: text, address: "" };
  const maybe = text.slice(idx + 3).trim();
  if (!isJapanAddressLike(maybe)) return { work: text, address: "" };
  return { work: text.slice(0, idx).trim(), address: maybe };
}

export function isJapanAddressLike(text: string): boolean {
  const normalized = text.normalize("NFKC");
  return /北海道|(?:東京|大阪|京都)都|[^\s]{2,3}県|[市区町村]|丁目|番地|\d[-−ー]?\d|\d号/.test(
    normalized,
  );
}

export function normalizeCompanyQuery(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/株式会社|有限会社|合同会社|合名会社|合資会社|一般社団法人|公益社団法人|一般財団法人|公益財団法人|社会福祉法人|学校法人|独立行政法人|国立研究開発法人|\(株\)|（株）|\(有\)|（有）/g, "")
    .replace(/[\s　・･,，.。]/g, "");
}

function loadPayeeProfiles(): Map<string, PayeeProfile> {
  if (profileCache) return profileCache;

  const map = new Map<string, PayeeProfile>();
  if (!existsSync(DATA_DIR)) {
    profileCache = map;
    return map;
  }

  const files = readdirSync(DATA_DIR)
    .filter((name) => {
      const match = /^fy(\d{4})\.json\.gz$/.exec(name);
      return match !== null && Number(match[1]) >= 2024;
    })
    .sort();

  for (const file of files) {
    const buffer = readFileSync(path.join(DATA_DIR, file));
    const dataset = JSON.parse(gunzipSync(buffer).toString("utf8")) as GyoseiYearDataset;
    for (const [projectIndex, payeeIndex, amount, , , corpNumber, work] of dataset.flows) {
      if (dataset.projects[projectIndex]?.[6]) continue;
      const name = dataset.dictionaries.payees[payeeIndex];
      if (!name) continue;
      const key = normalizeCompanyQuery(name);
      if (!key) continue;
      const { address } = splitWorkAndAddress(work || "");
      const current = map.get(key);
      if (!current) {
        map.set(key, {
          name,
          corporateNumber: corpNumber || "",
          address,
          amount,
        });
        continue;
      }
      current.amount += amount;
      if (!current.address && address) current.address = address;
      if (!current.corporateNumber && corpNumber) current.corporateNumber = corpNumber;
      if (name.length > current.name.length) current.name = name;
    }
  }

  profileCache = map;
  return map;
}

function searchReviewProfiles(query: string, limit = 8): PayeeProfile[] {
  const needle = normalizeCompanyQuery(query);
  if (!needle) return [];
  const profiles = [...loadPayeeProfiles().values()]
    .filter((profile) => {
      const key = normalizeCompanyQuery(profile.name);
      return key.includes(needle) || needle.includes(key);
    })
    .sort((a, b) => {
      const aExact = normalizeCompanyQuery(a.name) === needle ? 1 : 0;
      const bExact = normalizeCompanyQuery(b.name) === needle ? 1 : 0;
      if (aExact !== bExact) return bExact - aExact;
      const aAddr = a.address ? 1 : 0;
      const bAddr = b.address ? 1 : 0;
      if (aAddr !== bAddr) return bAddr - aAddr;
      return b.amount - a.amount;
    })
    .slice(0, limit);
  return profiles;
}

async function searchOpenStreetMap(name: string, limit = 5): Promise<ResolvedCompany[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", `${name} 日本`);
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("countrycodes", "jp");
  url.searchParams.set("limit", String(limit));

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent":
          "AQUA-MoneyFlow/1.0 (personal research; https://github.com/mickey4world-rgb/AQUA)",
      },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 86400 },
    });
    if (!response.ok) return [];
    const rows = (await response.json()) as Array<{
      display_name?: string;
      address?: Record<string, string>;
      type?: string;
      class?: string;
    }>;

    return rows
      .filter((row) => row.display_name)
      .map((row) => {
        const addr = row.address ?? {};
        const prefecture = addr.state || addr.province || "";
        const city =
          addr.city || addr.town || addr.village || addr.municipality || addr.county || "";
        const street = [addr.suburb, addr.neighbourhood, addr.road, addr.house_number]
          .filter(Boolean)
          .join("");
        const address =
          [prefecture, city, street].filter(Boolean).join("") ||
          String(row.display_name || "")
            .split(",")
            .slice(0, 3)
            .reverse()
            .join("")
            .replace(/\s+/g, "");
        const parsed = parseJapanAddress(address);
        return {
          name,
          corporateNumber: "",
          address,
          prefecture: prefecture || parsed.prefecture,
          city: city || parsed.city,
          source: "openstreetmap" as const,
        };
      })
      .filter((row) => row.address);
  } catch (error) {
    console.warn("[company-address] nominatim failed", error);
    return [];
  }
}

function fromHoujin(company: HoujinCompany): ResolvedCompany {
  return {
    name: company.name,
    corporateNumber: company.corporateNumber,
    address: company.address,
    prefecture: company.prefecture || parseJapanAddress(company.address).prefecture,
    city: company.city || parseJapanAddress(company.address).city,
    source: "houjin",
  };
}

/** 支出先名から住所つき企業候補を返す（レビュー → OSM → 任意で法人番号 API）。 */
export async function resolveCompaniesByName(
  query: string,
  limit = 8,
): Promise<ResolvedCompany[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const review = searchReviewProfiles(trimmed, limit).map((profile) => {
    const parsed = parseJapanAddress(profile.address);
    return {
      name: profile.name,
      corporateNumber: profile.corporateNumber,
      address: profile.address,
      prefecture: parsed.prefecture,
      city: parsed.city,
      source: "review" as const,
    };
  });

  const withAddress = review.filter((row) => row.address);
  if (withAddress.length > 0) return withAddress.slice(0, limit);

  if (isHoujinConfigured()) {
    const houjin = (await searchHoujinByName(trimmed, limit)).map(fromHoujin);
    if (houjin.length > 0) return houjin;
  }

  const osm = await searchOpenStreetMap(trimmed, Math.min(limit, 5));
  if (osm.length > 0) {
    // レビューに名前だけある場合は法人番号を付与
    return osm.map((row) => {
      const hit = review.find(
        (item) => normalizeCompanyQuery(item.name) === normalizeCompanyQuery(trimmed),
      );
      return hit
        ? {
            ...row,
            name: hit.name || row.name,
            corporateNumber: hit.corporateNumber || row.corporateNumber,
          }
        : row;
    });
  }

  // 住所なしでもレビュー上の支出先は返す
  return review.slice(0, limit);
}

export function isAddressLookupReady(): boolean {
  return true;
}
