/**
 * 日本株自動運用の固定ユニバース（9/22 候補 + 待機メモ A 枠）。
 * 週末スコアの採点対象。発注ホワイトリストとは別（ここはウォッチ用）。
 */
export type StockJpUniverseTier =
  | "core"
  | "core-mid"
  | "satellite"
  | "thin"
  | "watch-only";

export type StockJpUniverseEntry = {
  code: string;
  name: string;
  tags: string[];
  tier: StockJpUniverseTier;
};

/** 完全にコード側の固定リスト。LLM 新規発掘はしない。 */
export const STOCK_JP_UNIVERSE: readonly StockJpUniverseEntry[] = [
  {
    code: "1963",
    name: "日揮ホールディングス",
    tags: ["energy", "plant"],
    tier: "satellite",
  },
  {
    code: "5253",
    name: "カバー",
    tags: ["entertainment"],
    tier: "thin",
  },
  {
    code: "3064",
    name: "モノタロウ",
    tags: ["b2b"],
    tier: "core-mid",
  },
  {
    code: "4689",
    name: "LINEヤフー",
    tags: ["ai", "internet"],
    tier: "core",
  },
  {
    code: "4755",
    name: "楽天グループ",
    tags: ["internet", "fintech"],
    tier: "core",
  },
  {
    code: "6526",
    name: "ソシオネクスト",
    tags: ["semi"],
    tier: "core",
  },
  {
    code: "9107",
    name: "川崎汽船",
    tags: ["shipping"],
    tier: "satellite",
  },
  {
    code: "3778",
    name: "さくらインターネット",
    tags: ["ai", "cloud"],
    tier: "core",
  },
  {
    code: "6920",
    name: "レーザーテック",
    tags: ["semi"],
    tier: "watch-only",
  },
  {
    code: "6857",
    name: "アドバンテスト",
    tags: ["semi"],
    tier: "watch-only",
  },
  {
    code: "9984",
    name: "ソフトバンクグループ",
    tags: ["ai", "macro"],
    tier: "watch-only",
  },
  {
    code: "5803",
    name: "フジクラ",
    tags: ["ai", "fiber"],
    tier: "watch-only",
  },
  {
    code: "7779",
    name: "CYBERDYNE",
    tags: ["theme"],
    tier: "thin",
  },
  {
    code: "3903",
    name: "gumi",
    tags: ["game"],
    tier: "satellite",
  },
  {
    code: "3776",
    name: "BBT",
    tags: ["edtech"],
    tier: "satellite",
  },
] as const;

export function stockJpUniverseByCode(
  code: string,
): StockJpUniverseEntry | undefined {
  const normalized = code.replace(/\.T$/i, "");
  return STOCK_JP_UNIVERSE.find((e) => e.code === normalized);
}
