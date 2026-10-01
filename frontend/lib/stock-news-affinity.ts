/**
 * Works News Search ダイジェスト × 銘柄タグの適合スコア（純関数）。
 * 週末ユニバース採点・日次買い優先度で共有。
 */
import type {
  NewsSearchCategory,
  NewsSearchDigest,
  NewsSearchItem,
} from "@/lib/types/works-news-search";
import { NEWS_SEARCH_CATEGORIES } from "@/lib/types/works-news-search";

export type StockNewsAffinity = {
  /** 採点ボーナス（0〜約30） */
  bonus: number;
  matchedCategories: NewsSearchCategory[];
  matchedKeywords: string[];
  hitCount: number;
  topTitles: string[];
  digestId: string | null;
  digestFetchedAt: string | null;
};

/** 銘柄タグ → News Search カテゴリ */
export const STOCK_TAG_TO_NEWS_CATEGORIES: Record<
  string,
  readonly NewsSearchCategory[]
> = {
  ai: ["ai", "systems"],
  cloud: ["ai", "systems"],
  fiber: ["ai", "systems"],
  semi: ["ai", "systems", "economy"],
  internet: ["ai", "systems", "economy"],
  fintech: ["economy", "systems"],
  macro: ["economy"],
  energy: ["economy", "government"],
  plant: ["economy", "government"],
  shipping: ["economy"],
  b2b: ["economy"],
  entertainment: ["economy"],
  game: ["economy", "systems"],
  theme: ["ai"],
  edtech: ["systems", "government"],
};

/** タグごとの見出しキーワード（小文字比較用に正規化） */
export const STOCK_TAG_KEYWORDS: Record<string, readonly string[]> = {
  ai: [
    "ai",
    "人工知能",
    "生成ai",
    "llm",
    "chatgpt",
    "gpt",
    "gpu",
    "データセンター",
    "datacenter",
    "nvidia",
  ],
  cloud: ["クラウド", "cloud", "gpu", "データセンター", "iaas", "saas"],
  fiber: ["光ファイバ", "光部品", "光通信", "フジクラ", "datacenter"],
  semi: [
    "半導体",
    "semiconductor",
    "euv",
    "後工程",
    "テスタ",
    "レーザーテック",
    "アドバンテスト",
    "soc",
  ],
  internet: ["インターネット", "広告", "検索", "yahoo", "line"],
  fintech: ["フィンテック", "決済", "銀行", "楽天", "金利"],
  macro: ["金利", "軟調", "株価", "投資", "ソフトバンク", "ビジョンファンド"],
  energy: ["エネルギー", "石油", "lng", "プラント", "中東", "日揮"],
  plant: ["プラント", "エンジニアリング", "受注", "日揮"],
  shipping: ["海運", "運賃", "コンテナ", "バルク", "川崎汽船"],
  b2b: ["製造業", "設備投資", "ec", "モノタロウ"],
  entertainment: ["配信", "エンタメ", "vtuber", "カバー"],
  game: ["ゲーム", "アプリ", "gumi"],
  theme: ["医療ロボット", "cyberdyne", "hal"],
  edtech: ["教育", "オンライン学習", "bbt"],
};

function normalizeText(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "");
}

function itemBlob(item: NewsSearchItem): string {
  return normalizeText(
    [
      item.title,
      item.titleJa ?? "",
      item.summary,
      item.summaryJa ?? "",
      item.deepDive,
      item.outlook,
      item.explanation,
    ].join(" "),
  );
}

function flattenDigestItems(
  digest: NewsSearchDigest,
): Array<NewsSearchItem & { category: NewsSearchCategory }> {
  const out: Array<NewsSearchItem & { category: NewsSearchCategory }> = [];
  for (const cat of NEWS_SEARCH_CATEGORIES) {
    for (const item of digest.categories[cat] ?? []) {
      out.push({ ...item, category: cat });
    }
  }
  return out;
}

/**
 * ダイジェストに対する銘柄のニュース適合。
 * digest が無い場合は bonus=0（欠落で減点しない — データ欠落を失敗扱いにしない）。
 */
export function scoreStockNewsAffinity(input: {
  code: string;
  name: string;
  tags: string[];
  digest: NewsSearchDigest | null;
}): StockNewsAffinity {
  const empty: StockNewsAffinity = {
    bonus: 0,
    matchedCategories: [],
    matchedKeywords: [],
    hitCount: 0,
    topTitles: [],
    digestId: null,
    digestFetchedAt: null,
  };
  if (!input.digest) return empty;

  const items = flattenDigestItems(input.digest);
  if (items.length === 0) {
    return {
      ...empty,
      digestId: input.digest.id,
      digestFetchedAt: input.digest.fetchedAt,
    };
  }

  const tagSet = new Set(input.tags.map((t) => t.toLowerCase()));
  const relevantCategories = new Set<NewsSearchCategory>();
  const keywords: string[] = [];
  for (const tag of tagSet) {
    for (const cat of STOCK_TAG_TO_NEWS_CATEGORIES[tag] ?? []) {
      relevantCategories.add(cat);
    }
    for (const kw of STOCK_TAG_KEYWORDS[tag] ?? []) {
      keywords.push(kw);
    }
  }
  // 銘柄名・コードもキーワードに
  const nameParts = input.name
    .split(/[\s/／・]+/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 2);
  keywords.push(...nameParts, input.code);

  const matchedCategories = new Set<NewsSearchCategory>();
  const matchedKeywords = new Set<string>();
  const hitTitles: Array<{ title: string; attention: number }> = [];
  let hitCount = 0;
  let attentionSum = 0;

  for (const item of items) {
    const blob = itemBlob(item);
    let hit = false;

    if (relevantCategories.has(item.category)) {
      // カテゴリ一致だけでは弱く、キーワードか高注目でのみ加点対象
      const kwHit = keywords.some((kw) => blob.includes(normalizeText(kw)));
      if (kwHit || item.attentionScore >= 70) {
        matchedCategories.add(item.category);
        hit = true;
      }
    }

    for (const kw of keywords) {
      const n = normalizeText(kw);
      if (n.length >= 2 && blob.includes(n)) {
        matchedKeywords.add(kw);
        hit = true;
      }
    }

    if (hit) {
      hitCount += 1;
      attentionSum += item.attentionScore ?? 0;
      hitTitles.push({
        title: item.titleJa || item.title,
        attention: item.attentionScore ?? 0,
      });
    }
  }

  if (hitCount === 0) {
    return {
      ...empty,
      digestId: input.digest.id,
      digestFetchedAt: input.digest.fetchedAt,
    };
  }

  // ヒット件数・注目度・カテゴリ幅からボーナス（上限30）
  const catBonus = Math.min(12, matchedCategories.size * 4);
  const hitBonus = Math.min(12, hitCount * 3);
  const attnBonus = Math.min(8, Math.round(attentionSum / hitCount / 15));
  const bonus = Math.min(30, catBonus + hitBonus + attnBonus);

  hitTitles.sort((a, b) => b.attention - a.attention);

  return {
    bonus,
    matchedCategories: [...matchedCategories],
    matchedKeywords: [...matchedKeywords].slice(0, 8),
    hitCount,
    topTitles: hitTitles.slice(0, 3).map((t) => t.title),
    digestId: input.digest.id,
    digestFetchedAt: input.digest.fetchedAt,
  };
}
