/** 支出先・業務概要から分野をざっくり拾うためのキーワード辞書。 */

export type PayeeSector = {
  id: string;
  label: string;
  keywords: string[];
};

export const PAYEE_SECTORS: PayeeSector[] = [
  {
    id: "consulting",
    label: "コンサル",
    keywords: [
      "コンサル",
      "アクセンチュア",
      "デロイト",
      "トーマツ",
      "あずさ",
      "あずさ監査",
      "pwc",
      "ｋｐｍｇ",
      "kpmg",
      "マッキンゼー",
      "ボストン・コンサルティング",
      "ボストンコンサルティング",
      "bain",
      "アビーム",
      "野村総合研究所",
      "三菱総合研究所",
      "日本総合研究所",
      "大和総研",
      "みずほリサーチ",
      "いであ",
      "船井総合研究所",
      "経営コンサル",
      "戦略コンサル",
    ],
  },
  {
    id: "it",
    label: "IT・システム",
    keywords: [
      "システム",
      "ソフトウェア",
      "ソフトウエア",
      "富士通",
      "ｎｅｃ",
      "nec",
      "日立",
      "ｎｔｔデータ",
      "nttデータ",
      "ｎｔｔコム",
      "ibm",
      "ｉｂｍ",
      "オラクル",
      "マイクロソフト",
      "aws",
      "クラウド",
      "プログラム",
      "情報処理",
      "データセンター",
      "ネットワーク",
    ],
  },
  {
    id: "ads",
    label: "広告・広報",
    keywords: [
      "電通",
      "博報堂",
      "広告",
      "広報",
      "プロモーション",
      "イベント",
      "クリエイティブ",
      "媒体",
      "マーケティング",
    ],
  },
  {
    id: "construction",
    label: "建設・土木",
    keywords: [
      "建設",
      "土木",
      "鹿島",
      "大成建設",
      "清水建設",
      "竹中工務店",
      "大林組",
      "五洋建設",
      "工事",
      "設計事務所",
      "建築",
    ],
  },
  {
    id: "research",
    label: "研究・大学",
    keywords: [
      "大学",
      "研究所",
      "研究開発",
      "ｒ＆ｄ",
      "学会",
      "センター",
      "機構",
      "国立研究開発",
    ],
  },
  {
    id: "medical",
    label: "医療・福祉",
    keywords: [
      "医療",
      "病院",
      "クリニック",
      "福祉",
      "介護",
      "製薬",
      "メディカル",
      "健診",
      "保険",
    ],
  },
  {
    id: "local",
    label: "自治体・外郭",
    keywords: [
      "県",
      "市",
      "区",
      "町",
      "村",
      "広域連合",
      "公社",
      "独立行政法人",
      "国立",
      "公立",
    ],
  },
];

export function matchSector(
  sectorId: string | null | undefined,
  payeeName: string,
  work = "",
): boolean {
  if (!sectorId) return true;
  const sector = PAYEE_SECTORS.find((item) => item.id === sectorId);
  if (!sector) return true;
  const haystack = normalize(`${payeeName} ${work}`);
  return sector.keywords.some((keyword) => haystack.includes(normalize(keyword)));
}

export function detectSectors(payeeName: string, work = ""): string[] {
  const haystack = normalize(`${payeeName} ${work}`);
  return PAYEE_SECTORS.filter((sector) =>
    sector.keywords.some((keyword) => haystack.includes(normalize(keyword))),
  ).map((sector) => sector.id);
}

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/株式会社|有限会社|合同会社|\(株\)|（株）|\s+/g, "");
}
