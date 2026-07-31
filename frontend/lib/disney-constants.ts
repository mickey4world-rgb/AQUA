import type { DisneyParkKey } from "@/lib/types/disney";

export const DISNEY_PARKS: Record<
  DisneyParkKey,
  { id: string; name: string; nameJa: string }
> = {
  tdl: {
    id: "3cc919f1-d16d-43e0-8c3f-1dd269bd1a42",
    name: "Tokyo Disneyland",
    nameJa: "東京ディズニーランド",
  },
  tds: {
    id: "67b290d5-3478-4f23-b601-2f8fb71ba803",
    name: "Tokyo DisneySea",
    nameJa: "東京ディズニーシー",
  },
};

export const POPULAR_ATTRACTIONS: Record<DisneyParkKey, string[]> = {
  tdl: [
    "Beauty and the Beast",
    "Baymax",
    "Space Mountain",
    "Splash Mountain",
    "Pooh's Hunny Hunt",
    "Monsters, Inc.",
    "Big Thunder Mountain",
    "Haunted Mansion",
  ],
  tds: [
    "Journey to the Center of the Earth",
    "Tower of Terror",
    "Indiana Jones",
    "Soaring",
    "Rapunzel",
    "Frozen",
    "Nemo",
    "Toy Story",
  ],
};

export const ATTRACTION_NAME_JA: Record<string, string> = {
  "Beauty and the Beast": "美女と野獣",
  "Baymax": "ベイマックス",
  "Space Mountain": "スペース・マウンテン",
  "Splash Mountain": "スプラッシュ・マウンテン",
  "Pooh's Hunny Hunt": "プーさんのハニーハント",
  "Monsters, Inc.": "モンスターズ・インク",
  "Big Thunder Mountain": "ビッグサンダー・マウンテン",
  "Haunted Mansion": "ホーンテッドマンション",
  "Journey to the Center of the Earth": "センター・オブ・ジ・アース",
  "Tower of Terror": "タワー・オブ・テラー",
  "Indiana Jones": "インディ・ジョーンズ",
  "Soaring": "ソアリン",
};
