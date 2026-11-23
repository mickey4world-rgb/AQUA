import type { SolunaNewsItem } from "@/lib/types/soluna";

/**
 * 一般読者（Note／タイムライン）向けの注目度推定。
 * LLM が付けた attentionScore があっても、Note 題材では再スコアして
 * 「実務では重要だが話題性の薄い記事」が大ボスになるのを防ぐ。
 */
export function estimateSolunaAttentionScore(
  item: Pick<
    SolunaNewsItem,
    "title" | "summary" | "titleJa" | "summaryJa" | "sourceUrl" | "publishedAt" | "attentionScore" | "keyword"
  >,
  now = Date.now(),
): number {
  // Note 向けは常に中身から推定する（呼び出し側が works 点を混ぜたい場合は scoreSolunaNoteAudienceAttention）
  let score = 38;
  const url = (item.sourceUrl ?? "").toLowerCase();
  if (
    /reuters|bloomberg|nikkei|wsj\.com|ft\.com|bbc\.|cnn\.|apnews|nhk\.|asahi\.|mainichi|yomiuri|coindesk|techcrunch|forbes|guardian|nytimes|washingtonpost/.test(
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
      else if (ageH > 96) score -= 12;
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

  // 一般読者がタイムラインで止まりやすい本丸
  if (
    /fed|frb|ecb|金利|利上げ|利下げ|関税|tariff|ceasefire|停戦|戦争|紛争|ミサイル|選挙|election|トランプ|大統領|openai|nvidia|apple|google|microsoft|meta|amazon|tesla|急騰|急落|暴落|史上|breakthrough|制裁|買収|合併|ipo|レイオフ|破綻|倒産|デフォルト|日銀|円安|円高|日経|株価|bitcoin|btc|地震|台風|停電|サイバー攻撃|データ漏洩|原発|五輪|ワールドカップ/.test(
      text,
    )
  ) {
    score += 18;
  }

  // もう一段「話題の熱」
  if (
    /速報|breaking|緊急|史上初|過去最大|過去最高|突然|衝撃|大荒れ|パニック|制裁発動|宣戦|クーデター|非常事態/.test(
      text,
    )
  ) {
    score += 10;
  }

  // ニッチ・実務通向け（Note の題材としては弱い）
  if (
    /社内|勉強会|豆知識|パブリックコメント|調達仕様|入札公告|官報|庁内|ガイドライン改定案|通達|説明会|ウェビナー|採用イベント|製品アップデートノート|リリースノート|minor update|changelog/.test(
      text,
    )
  ) {
    score -= 18;
  }

  // 政府・防衛の細かい運用ネタは、戦争／制裁などの本丸語が無い限り下げる
  if (
    /(政府|防衛|自衛|調達|情報保全|クラウド移行|庁|省)/.test(text) &&
    !/(戦争|停戦|ミサイル|制裁|関税|選挙|金利|破綻|急騰|急落|openai|nvidia)/.test(text)
  ) {
    score -= 12;
  }

  return Math.max(1, Math.min(100, score));
}

/**
 * WORKS 実務点と一般注目推定を混ぜ、Note／討伐の大ボス選定に使う。
 * 実務点だけ高いニッチ記事を落とし、話題性の高い本丸を上げる。
 */
export function scoreSolunaNoteAudienceAttention(
  item: Pick<
    SolunaNewsItem,
    "title" | "summary" | "titleJa" | "summaryJa" | "sourceUrl" | "publishedAt" | "attentionScore" | "keyword"
  > & { category?: string },
  now = Date.now(),
): number {
  const works =
    typeof item.attentionScore === "number" && Number.isFinite(item.attentionScore)
      ? Math.max(1, Math.min(100, Math.round(item.attentionScore)))
      : 50;
  const general = estimateSolunaAttentionScore(
    { ...item, attentionScore: undefined },
    now,
  );

  // 一般注目をやや厚めに（Note は「おもしろい／話題」が契約）
  let blended = Math.round(works * 0.42 + general * 0.58);

  const category = (item.category ?? item.keyword ?? "").toLowerCase();
  const massCategory =
    category.includes("economy") ||
    category.includes("経済") ||
    category.includes("ai") ||
    category.includes("systems") ||
    category.includes("システム");
  const nicheCategory =
    category.includes("government") ||
    category.includes("national-security") ||
    category.includes("国家") ||
    category.includes("security") ||
    category.includes("セキュリティ") ||
    category.includes("政府");

  if (massCategory) blended += 4;
  if (nicheCategory && general < 72) {
    // 実務点だけ高い細かい通達・調達ネタを Note 大ボスから外す
    blended = Math.min(blended, Math.max(general + 12, 55));
  }
  // AI／経済／システムで WORKS が高注目なら、題材枠を落とさない
  if (massCategory && works >= 80) {
    blended = Math.max(blended, 80);
  }
  // 一般注目が本丸級なら、カテゴリを問わず押し上げる
  if (general >= 80) {
    blended = Math.max(blended, general);
  }

  return Math.max(1, Math.min(100, blended));
}

export function withEstimatedAttention<T extends SolunaNewsItem>(
  items: T[],
  now = Date.now(),
): T[] {
  return items
    .map((item) => ({
      ...item,
      attentionScore: scoreSolunaNoteAudienceAttention(item, now),
    }))
    .sort((a, b) => (b.attentionScore ?? 0) - (a.attentionScore ?? 0));
}
