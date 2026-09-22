import { createHash } from "crypto";
import { getDisneyRecordsContainer, isCosmosConfigured } from "@/lib/server/cosmos";
import { jstDateString } from "@/lib/server/soluna-system-config";
import type { NewsSearchDigest } from "@/lib/types/works-news-search";
import { withCategoriesSortedByAttention } from "@/lib/works-news-search-sort";

function digestIdForDate(date = new Date()): string {
  return `works-news-search-${jstDateString(date)}`;
}

export function worksNewsSearchDocId(date = new Date()): string {
  return digestIdForDate(date);
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
  // 昨日分まで許容（深夜ジョブ直後の朝）
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return getWorksNewsDigestById(digestIdForDate(yesterday));
}

export function stableNewsItemId(
  category: string,
  title: string,
  sourceUrl?: string,
): string {
  const raw = `${category}|${sourceUrl || title}`;
  return createHash("sha1").update(raw).digest("hex").slice(0, 16);
}
