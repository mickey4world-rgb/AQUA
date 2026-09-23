import { createHash } from "crypto";
import { getDisneyRecordsContainer, isCosmosConfigured } from "@/lib/server/cosmos";
import { jstDateString } from "@/lib/server/soluna-system-config";
import type { NewsSearchDigest } from "@/lib/types/works-news-search";
import { withCategoriesSortedByAttention } from "@/lib/works-news-search-sort";

/** UI で遡れる日数（当日含む） */
export const WORKS_NEWS_HISTORY_DAYS = 7;

const JST_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function digestIdForDate(date = new Date()): string {
  return `works-news-search-${jstDateString(date)}`;
}

export function worksNewsSearchDocId(date = new Date()): string {
  return digestIdForDate(date);
}

export function worksNewsSearchDocIdForJstDate(jstDate: string): string {
  return `works-news-search-${jstDate}`;
}

/** JST 日付文字列を日数シフト（日本は DST なし。UTC 正午基準で安全） */
export function shiftJstDateString(jstDate: string, deltaDays: number): string {
  if (!JST_DATE_RE.test(jstDate)) {
    throw new Error(`invalid JST date: ${jstDate}`);
  }
  const [y, m, d] = jstDate.split("-").map(Number);
  const utc = Date.UTC(y!, m! - 1, d! + deltaDays, 12, 0, 0);
  return new Date(utc).toISOString().slice(0, 10);
}

export function isAllowedWorksNewsHistoryDate(jstDate: string, now = new Date()): boolean {
  if (!JST_DATE_RE.test(jstDate)) return false;
  const today = jstDateString(now);
  if (jstDate > today) return false;
  const oldest = shiftJstDateString(today, -(WORKS_NEWS_HISTORY_DAYS - 1));
  return jstDate >= oldest;
}

export type WorksNewsDigestHistoryEntry = {
  date: string;
  id: string;
  available: boolean;
  fetchedAt?: string;
  enrichmentStatus?: NewsSearchDigest["enrichmentStatus"];
  source?: NewsSearchDigest["source"];
  summary?: string;
};

/** 直近 N 日（JST・当日含む）の有無一覧。欠けた日も available:false で返す */
export async function listRecentWorksNewsDigestMeta(
  days = WORKS_NEWS_HISTORY_DAYS,
  now = new Date(),
): Promise<WorksNewsDigestHistoryEntry[]> {
  const today = jstDateString(now);
  const n = Math.max(1, Math.min(days, 31));
  const entries: WorksNewsDigestHistoryEntry[] = [];
  for (let i = 0; i < n; i += 1) {
    const date = shiftJstDateString(today, -i);
    const id = worksNewsSearchDocIdForJstDate(date);
    const dig = await getWorksNewsDigestById(id);
    if (!dig) {
      entries.push({ date, id, available: false });
      continue;
    }
    entries.push({
      date,
      id,
      available: true,
      fetchedAt: dig.fetchedAt,
      enrichmentStatus: dig.enrichmentStatus,
      source: dig.source,
      summary: dig.summary?.slice(0, 160),
    });
  }
  return entries;
}

export async function getWorksNewsDigestForJstDate(
  jstDate: string,
): Promise<NewsSearchDigest | null> {
  if (!isAllowedWorksNewsHistoryDate(jstDate)) return null;
  return getWorksNewsDigestById(worksNewsSearchDocIdForJstDate(jstDate));
}

export async function saveWorksNewsDigest(digest: NewsSearchDigest): Promise<void> {
  if (!isCosmosConfigured()) {
    throw new Error("Cosmos DB が未設定です。");
  }
  const normalized = withCategoriesSortedByAttention(digest);
  const container = await getDisneyRecordsContainer();
  await container.items.upsert({
    ...normalized,
    docType: "worksNewsSearchDigest",
  });
}

export async function getWorksNewsDigestById(
  id: string,
): Promise<NewsSearchDigest | null> {
  if (!isCosmosConfigured()) return null;
  try {
    const container = await getDisneyRecordsContainer();
    const { resource } = await container.item(id, id).read<NewsSearchDigest>();
    if (!resource) return null;
    return withCategoriesSortedByAttention(resource);
  } catch {
    return null;
  }
}

/** 当日（JST）のダイジェストのみ。cron / skip 判定はこちら（昨日 complete ≠ 当日完了）。 */
export async function getTodayWorksNewsDigest(): Promise<NewsSearchDigest | null> {
  return getWorksNewsDigestById(digestIdForDate());
}

/**
 * UI 閲覧用: 当日が無ければ昨日まで許容（朝の空白を避ける）。
 * cron の「当日完了」判定には使わない — getTodayWorksNewsDigest を使うこと。
 */
export async function getLatestWorksNewsDigest(): Promise<NewsSearchDigest | null> {
  const today = await getTodayWorksNewsDigest();
  if (today) return today;
  // 昨日分まで許容（深夜ジョブ直後の朝）。UTC setDate ではなく JST 日付で遡る。
  const yesterdayJst = shiftJstDateString(jstDateString(), -1);
  return getWorksNewsDigestById(worksNewsSearchDocIdForJstDate(yesterdayJst));
}

export function stableNewsItemId(
  category: string,
  title: string,
  sourceUrl?: string,
): string {
  const raw = `${category}|${sourceUrl || title}`;
  return createHash("sha1").update(raw).digest("hex").slice(0, 16);
}
