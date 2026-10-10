import type { SolunaNewsItem } from "@/lib/types/soluna";

/**
 * 注目度が欠ける RSS 等でも、大ボス選定がニッチ記事に流れないよう推定する。
 * LLM が付けた attentionScore があればそれを優先（0〜100 にクランプ）。
 */
export function estimateSolunaAttentionScore(
  item: Pick<
    SolunaNewsItem,
    "title" | "summary" | "titleJa" | "summaryJa" | "sourceUrl" | "publishedAt" | "attentionScore" | "keyword"
  >,
  now = Date.now(),
): number {
  if (typeof item.attentionScore === "number" && Number.isFinite(item.attentionScore)) {
    return Math.max(1, Math.min(100, Math.round(item.attentionScore)));
  }

  let score = 42;
  const url = (item.sourceUrl ?? "").toLowerCase();
  if (
    /reuters|bloomberg|nikkei|wsj\.com|ft\.com|bbc\.|cnn\.|apnews|nhk\.|asahi\.|mainichi|yomiuri|bloomberg|coindesk|techcrunch/.test(
      url,
    )
  ) {
    score += 18;
  }

  if (item.publishedAt) {
    const t = new Date(item.publishedAt).getTime();
    if (!Number.isNaN(t)) {
      const ageH = (now - t) / 3_600_000;
      if (ageH >= 0 && ageH < 12) score += 22;
      else if (ageH < 24) score += 14;
      else if (ageH < 48) score += 6;
    }
  }

  const text = [
    item.title,
    item.titleJa,
    item.summary,
    item.summaryJa,
    item.keyword,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (
    /fed|frb|金利|関税|tariff|ceasefire|戦争|選挙|election|openai|nvidia|apple|google|microsoft|急騰|急落|史上|breakthrough|制裁|制裁解除/.test(
      text,
    )
  ) {
    score += 14;
  }

  // ニッチすぎるサイン
  if (/社内|勉強会|豆知識|豆知識|豆知識|豆知識/.test(text)) score -= 10;

  return Math.max(1, Math.min(100, score));
}

export function withEstimatedAttention<T extends SolunaNewsItem>(
  items: T[],
  now = Date.now(),
): T[] {
  return items
    .map((item) => ({
      ...item,
      attentionScore: estimateSolunaAttentionScore(item, now),
    }))
    .sort(
      (a, b) => (b.attentionScore ?? 0) - (a.attentionScore ?? 0),
    );
}
