import { fetchCloseApproaches } from "@/lib/server/nasa-neo";
import type { CloseApproach, NeoPublicPreviewSnapshot } from "@/lib/types/space";

export type { NeoPublicPreviewSnapshot };

const MEMORY_TTL_MS = 55 * 60 * 1000;

let memoryCache: { dateKey: string; snapshot: NeoPublicPreviewSnapshot; builtAt: number } | null =
  null;
let buildPromise: Promise<NeoPublicPreviewSnapshot> | null = null;

function jstYmdKey(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function approachJstYmdKey(approach: CloseApproach): string {
  return jstYmdKey(new Date(approach.closeApproachAt));
}

function pickFeaturedApproach(approaches: CloseApproach[], todayKey: string) {
  const todayOnes = approaches.filter(
    (approach) => approachJstYmdKey(approach) === todayKey,
  );
  if (todayOnes.length > 0) {
    const featured = todayOnes.reduce((best, current) =>
      current.distanceMinKm < best.distanceMinKm ? current : best,
    );
    return {
      featured,
      mode: "today" as const,
      headline: "本日（JST）最接近の小惑星",
      todayApproachCount: todayOnes.length,
    };
  }

  const featured = approaches[0];
  if (!featured) {
    return null;
  }

  return {
    featured,
    mode: "upcoming" as const,
    headline: "本日接近予定はありません。次に近づく小惑星",
    todayApproachCount: 0,
  };
}

async function buildFreshSnapshot(): Promise<NeoPublicPreviewSnapshot> {
  const result = await fetchCloseApproaches(40);
  if (!result.ok || result.approaches.length === 0) {
    throw new Error(result.ok ? "接近小惑星データがありません" : result.reason);
  }

  const todayJst = jstYmdKey();
  const picked = pickFeaturedApproach(result.approaches, todayJst);
  if (!picked) {
    throw new Error("接近小惑星データがありません");
  }

  const snapshot: NeoPublicPreviewSnapshot = {
    generatedAt: new Date().toISOString(),
    todayJst,
    mode: picked.mode,
    headline: picked.headline,
    featured: picked.featured,
    todayApproachCount: picked.todayApproachCount,
    loginNotice:
      "ログイン後は全リスト・望遠鏡タイムライン・イーグルアイ地球ビューが利用できます。",
  };

  memoryCache = { dateKey: todayJst, snapshot, builtAt: Date.now() };
  return snapshot;
}

/** 認証不要・当日最接近（または次回接近）の小惑星プレビュー */
export async function getNeoPublicPreview(): Promise<NeoPublicPreviewSnapshot> {
  const todayJst = jstYmdKey();

  if (
    memoryCache?.dateKey === todayJst &&
    Date.now() - memoryCache.builtAt < MEMORY_TTL_MS
  ) {
    return memoryCache.snapshot;
  }

  if (!buildPromise) {
    buildPromise = buildFreshSnapshot().finally(() => {
      buildPromise = null;
    });
  }
  return buildPromise;
}
