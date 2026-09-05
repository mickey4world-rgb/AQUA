import { createHash } from "crypto";
import { getDisneyRecordsContainer, isCosmosConfigured } from "@/lib/server/cosmos";
import { jstDateString } from "@/lib/server/soluna-system-config";
import type { NewsSearchDigest } from "@/lib/types/works-news-search";

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
  const container = await getDisneyRecordsContainer();
  await container.items.upsert({
    ...digest,
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
    return resource ?? null;
  } catch {
    return null;
  }
}

export async function getLatestWorksNewsDigest(): Promise<NewsSearchDigest | null> {
  const today = await getWorksNewsDigestById(digestIdForDate());
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
