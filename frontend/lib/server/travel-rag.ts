/**
 * Travel 資料 RAG: チャンクをクエリ適合度で選び、判読プロンプト用コンテキストを組む
 */
import type { TravelMaterial, TravelTrip } from "@/lib/types/travel";

const DEFAULT_MAX_CHARS = 11_000;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

function scoreChunk(
  chunkText: string,
  queryTokens: Set<string>,
  boostTerms: string[],
): number {
  const lower = chunkText.toLowerCase();
  let score = 0;
  for (const t of queryTokens) {
    if (lower.includes(t)) score += 1.2;
  }
  for (const b of boostTerms) {
    if (b && lower.includes(b.toLowerCase())) score += 2.5;
  }
  // 行程らしい語
  if (/日目|出発|到着|観光|昼食|夕食|ホテル|宿泊|新幹線|空港|バス|自由行動/.test(chunkText)) {
    score += 1.5;
  }
  if (/\d{1,2}:\d{2}/.test(chunkText)) score += 0.8;
  return score;
}

export function retrieveTravelMaterialContext(input: {
  materials: TravelMaterial[];
  trip: Pick<TravelTrip, "title" | "destination" | "startDate" | "endDate" | "summary">;
  extraQuery?: string;
  maxChars?: number;
}): {
  text: string;
  usedChunkCount: number;
  materialNames: string[];
} {
  const maxChars = input.maxChars ?? DEFAULT_MAX_CHARS;
  const query = [
    input.trip.title,
    input.trip.destination,
    input.trip.startDate,
    input.trip.endDate,
    input.trip.summary ?? "",
    input.extraQuery ?? "",
  ].join(" ");
  const queryTokens = new Set(tokenize(query));
  const boost = [
    input.trip.destination,
    ...(input.trip.destination || "").split(/[・／/\s]+/),
  ].filter(Boolean);

  type Ranked = {
    fileName: string;
    index: number;
    text: string;
    score: number;
  };
  const ranked: Ranked[] = [];
  for (const mat of input.materials) {
    for (const ch of mat.chunks ?? []) {
      ranked.push({
        fileName: mat.fileName,
        index: ch.index,
        text: ch.text,
        score: scoreChunk(ch.text, queryTokens, boost),
      });
    }
  }

  ranked.sort((a, b) => b.score - a.score || a.index - b.index);

  // Always include early chunks of each file (cover sheet / day1) even if score low
  const early = new Set<string>();
  for (const mat of input.materials) {
    for (const ch of (mat.chunks ?? []).slice(0, 2)) {
      early.add(`${mat.fileName}#${ch.index}`);
    }
  }

  const selected: Ranked[] = [];
  const seen = new Set<string>();
  for (const item of ranked) {
    const key = `${item.fileName}#${item.index}`;
    if (item.score <= 0 && !early.has(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    selected.push(item);
  }
  // Fill with remaining by order if still short
  if (selected.length < 6) {
    for (const mat of input.materials) {
      for (const ch of mat.chunks ?? []) {
        const key = `${mat.fileName}#${ch.index}`;
        if (seen.has(key)) continue;
        seen.add(key);
        selected.push({
          fileName: mat.fileName,
          index: ch.index,
          text: ch.text,
          score: 0,
        });
        if (selected.length >= 12) break;
      }
      if (selected.length >= 12) break;
    }
  }

  selected.sort((a, b) => a.fileName.localeCompare(b.fileName) || a.index - b.index);

  const parts: string[] = ["【アップロード資料（RAG 抜粋）】"];
  let used = 0;
  let usedChunkCount = 0;
  const names = new Set<string>();
  for (const item of selected) {
    const block = `\n--- ${item.fileName} #${item.index + 1} ---\n${item.text}`;
    if (used + block.length > maxChars) {
      const room = maxChars - used - 40;
      if (room < 80) break;
      parts.push(block.slice(0, room) + "…");
      usedChunkCount += 1;
      names.add(item.fileName);
      break;
    }
    parts.push(block);
    used += block.length;
    usedChunkCount += 1;
    names.add(item.fileName);
  }

  if (usedChunkCount < 1) {
    return { text: "", usedChunkCount: 0, materialNames: [] };
  }

  return {
    text: parts.join(""),
    usedChunkCount,
    materialNames: [...names],
  };
}
