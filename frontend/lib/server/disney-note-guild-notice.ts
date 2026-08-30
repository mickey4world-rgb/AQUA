import { getJstToday } from "@/lib/disney-holidays";
import { buildCharacterEveningAdvice } from "@/lib/server/disney-character-advice";

const PREVIEW_URL =
  process.env.TDR_PUBLIC_PREVIEW_URL?.trim() || "https://www.aquacore.net/tdr-preview";

function clip(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** Note 末尾用：アクアピアギルド TDR 混雑予報（ルールベース・外部 API なし） */
export function buildDisneyGuildNoticeForNote(): string {
  const today = getJstToday();
  const land = buildCharacterEveningAdvice("tdl", today, "today", "preview");
  const sea = buildCharacterEveningAdvice("tds", today, "today", "preview");

  return `## 🏰 アクアピアギルドからのお知らせ（TDR混雑予報）

**ランド洞窟（本日）** — 混雑スコア ${land.crowdScore} / ${land.crowdLabel}
${land.characterNameJa}: ${clip(land.headline, 140)}

**シー海域（本日）** — 混雑スコア ${sea.crowdScore} / ${sea.crowdLabel}
${sea.characterNameJa}: ${clip(sea.headline, 140)}

・ランド洞窟の回り方: ${land.touringTips[0] ?? "開園直後に人気アトラクションを優先"}
・シー海域の回り方: ${sea.touringTips[0] ?? "開園直後にセンター・オブ・ジ・アースを優先"}

詳細（無料）: ${PREVIEW_URL}`;
}
