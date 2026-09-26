import type { ThemeParkKey } from "@/lib/types/theme-park";

/** ThemeParks Wiki entity id: Universal Studios Japan */
export const USJ_PARK = {
  id: "47f61fac-7586-41ac-ae80-61c9257cf33e",
  key: "usj" as const satisfies ThemeParkKey,
  name: "Universal Studios Japan",
  nameJa: "ユニバーサル・スタジオ・ジャパン",
  shortJa: "USJ",
};

export const USJ_POPULAR_ATTRACTIONS = [
  "Nintendo",
  "Mario",
  "Yoshi",
  "Donkey Kong",
  "Harry Potter",
  "Forbidden Journey",
  "Flight of the Hippogriff",
  "Flying Dinosaur",
  "Hollywood Dream",
  "Jurassic",
  "Spider-Man",
  "Minion",
  "Despicable",
  "JAWS",
  "Horror",
  "Halloween",
  "Chainsaw",
  "Snoopy",
  "Hello Kitty",
];

export const USJ_ATTRACTION_NAME_JA: Record<string, string> = {
  "Yoshi's Adventure™": "ヨッシー・アドベンチャー",
  "The Flying Dinosaur": "ザ・フライング・ダイナソー",
  "Hollywood Dream — The Ride": "ハリウッド・ドリーム・ザ・ライド",
  "Harry Potter and the Forbidden Journey™": "ハリー・ポッター・アンド・ザ・フォービドゥン・ジャーニー",
  "Flight of the Hippogriff™": "フライト・オブ・ザ・ヒッポグリフ",
  "The Amazing Adventures of Spider-Man — The Ride 4K3D": "アメイジング・アドベンチャー・オブ・スパイダーマン",
  "JAWS": "ジョーズ",
  "The Flying Snoopy": "ザ・フライング・スヌーピー",
  "Hello Kitty's Cupcake Dream": "ハローキティのカップケーキ・ドリーム",
  "Despicable Me: Minion Mayhem": "ミニオン・ハチャメチャ・ライド",
  "Chainsaw Man: The Chaos 4-D": "チェンソーマン・ザ・カオス 4-D",
};
