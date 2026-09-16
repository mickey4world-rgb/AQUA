/**
 * 旅行会社資料 → 行程ストップ抽出 + 無料ジオコーディング（Nominatim）
 * LLM: Gemini → 安価 Azure OpenAI フォールバック
 */
import { randomUUID } from "crypto";
import { sanitizeText } from "@/lib/server/security";
import {
  generateTravelJson,
  isTravelLlmConfigured,
  parseTravelJsonText,
} from "@/lib/server/travel-llm";
import type {
  TravelStop,
  TravelStopKind,
  TravelTransportMode,
} from "@/lib/types/travel";

type ParsedStopRaw = {
  dayIndex?: number;
  order?: number;
  name?: string;
  kind?: string;
  date?: string;
  timeLabel?: string;
  address?: string;
  note?: string;
  sourceSnippet?: string;
  queryForGeocode?: string;
  transportMode?: string;
};

const KIND_SET = new Set<TravelStopKind>([
  "sight",
  "meal",
  "hotel",
  "transport",
  "free",
  "other",
]);

const TRANSPORT_SET = new Set<TravelTransportMode>([
  "walk",
  "train",
  "bus",
  "car",
  "taxi",
  "plane",
  "ship",
  "bike",
  "other",
]);

function asKind(raw: string | undefined): TravelStopKind {
  const k = (raw || "").toLowerCase() as TravelStopKind;
  return KIND_SET.has(k) ? k : "other";
}

function asTransport(raw: string | undefined): TravelTransportMode | undefined {
  if (!raw) return undefined;
  const t = raw.toLowerCase() as TravelTransportMode;
  return TRANSPORT_SET.has(t) ? t : undefined;
}

/** OpenStreetMap Nominatim（利用規定: 明確な User-Agent・控えめな頻度） */
export async function geocodePlace(
  query: string,
): Promise<{ lat: number; lon: number; displayName?: string } | null> {
  const q = query.trim();
  if (!q) return null;
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "AquaTravelApp/1.0 (personal; contact=aquacore.net)",
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{
      lat?: string;
      lon?: string;
      display_name?: string;
    }>;
    const hit = data[0];
    if (!hit?.lat || !hit?.lon) return null;
    return {
      lat: Number(hit.lat),
      lon: Number(hit.lon),
      displayName: hit.display_name,
    };
  } catch {
    return null;
  }
}

export async function parseTravelMaterial(input: {
  text: string;
  destinationHint?: string;
  startDate?: string;
  endDate?: string;
}): Promise<{
  stops: TravelStop[];
  tripTitle?: string;
  summary?: string;
  provider?: string;
}> {
  const text = sanitizeText(input.text, 12000);
  if (!text || text.length < 20) {
    throw new Error("資料テキストが短すぎます（もう少し貼り付けてください）");
  }
  if (!isTravelLlmConfigured()) {
    throw new Error(
      "Gemini / Azure OpenAI のどちらも未設定のため資料の判読ができません",
    );
  }

  const system = `あなたは旅行日程の構造化アシスタントです。旅行会社のしおり・行程表から、地図に載せる観光ポイントを JSON で抽出します。
推測で存在しない店名・施設を捏造しない。資料に無いものは空にする。
kind は sight|meal|hotel|transport|free|other。
transportMode は walk|train|bus|car|taxi|plane|ship|bike|other（移動区間や kind=transport のとき）。
dayIndex は 0 始まり（1日目=0）。
queryForGeocode は「都市名 + 施設名」など Nominatim で探しやすい短い日本語/英語。
JSONのみ:
{"tripTitle":"...","summary":"2文以内","stops":[{"dayIndex":0,"order":0,"name":"...","kind":"sight","transportMode":"","date":"YYYY-MM-DD","timeLabel":"10:00","address":"...","note":"...","sourceSnippet":"原文抜粋","queryForGeocode":"..."}]}`;

  const user = `行き先ヒント: ${input.destinationHint || "（不明）"}
開始日: ${input.startDate || "（不明）"}
終了日: ${input.endDate || "（不明）"}

--- 資料 ---
${text}`;

  const result = await generateTravelJson({
    system,
    user,
    maxOutputTokens: 3500,
    temperature: 0.2,
  });

  if (!result.ok) {
    throw new Error(result.reason || "資料の解析に失敗しました");
  }

  let parsed: {
    tripTitle?: string;
    summary?: string;
    stops?: ParsedStopRaw[];
  };
  try {
    parsed = parseTravelJsonText(result.text);
  } catch {
    throw new Error("資料解析の応答が JSON ではありませんでした");
  }

  const rawStops = Array.isArray(parsed.stops) ? parsed.stops : [];
  const stops: TravelStop[] = [];

  const MAX_GEOCODE = 28;
  let geocodeCount = 0;
  for (let i = 0; i < Math.min(rawStops.length, 60); i += 1) {
    const raw = rawStops[i]!;
    const name = sanitizeText(raw.name ?? "", 120);
    if (!name) continue;
    const query =
      sanitizeText(raw.queryForGeocode ?? "", 160) ||
      [input.destinationHint, name, raw.address].filter(Boolean).join(" ");
    let geo: { lat: number; lon: number; displayName?: string } | null = null;
    if (geocodeCount < MAX_GEOCODE) {
      if (geocodeCount > 0) await new Promise((r) => setTimeout(r, 1100));
      geo = await geocodePlace(query);
      geocodeCount += 1;
    }

    const kind = asKind(raw.kind);
    const transportMode =
      asTransport(raw.transportMode) ||
      (kind === "transport" ? ("other" as const) : undefined);

    stops.push({
      id: randomUUID(),
      dayIndex: Number.isFinite(raw.dayIndex) ? Math.max(0, Number(raw.dayIndex)) : 0,
      order: Number.isFinite(raw.order) ? Number(raw.order) : i,
      name,
      kind,
      transportMode,
      date: raw.date ? sanitizeText(raw.date, 32) : undefined,
      timeLabel: raw.timeLabel ? sanitizeText(raw.timeLabel, 32) : undefined,
      address: raw.address
        ? sanitizeText(raw.address, 200)
        : geo?.displayName
          ? sanitizeText(geo.displayName, 200)
          : undefined,
      lat: geo?.lat,
      lon: geo?.lon,
      note: raw.note ? sanitizeText(raw.note, 600) : undefined,
      sourceSnippet: raw.sourceSnippet
        ? sanitizeText(raw.sourceSnippet, 400)
        : undefined,
    });
  }

  if (stops.length < 1) {
    throw new Error("資料から観光ポイントを抽出できませんでした。別の抜粋を試してください。");
  }

  return {
    stops,
    tripTitle: parsed.tripTitle ? sanitizeText(parsed.tripTitle, 120) : undefined,
    summary: parsed.summary ? sanitizeText(parsed.summary, 800) : undefined,
    provider: `${result.provider}:${result.model}`,
  };
}

export async function enrichTravelStops(stops: TravelStop[]): Promise<{
  stops: TravelStop[];
  provider?: string;
}> {
  if (!isTravelLlmConfigured()) {
    throw new Error(
      "Gemini / Azure OpenAI のどちらも未設定のためおすすめ提案ができません",
    );
  }
  const targets = stops.filter((s) => s.lat != null && s.lon != null).slice(0, 24);
  if (targets.length < 1) {
    throw new Error(
      "地図上の位置が付いた地点がないためおすすめを付けられません。資料を再判読して位置を確定してください。",
    );
  }

  const catalog = targets.map((s) => ({
    id: s.id,
    name: s.name,
    kind: s.kind,
    address: s.address,
    note: s.note,
  }));

  const result = await generateTravelJson({
    system: `旅行の各スポットについて、現地で役立つ短いおすすめを JSON で返す。
事実に自信がない内容は書かない。URL は公式っぽい一般ドメインのみ（無ければ空）。
JSONのみ:
{"items":[{"id":"...","tip":"80字以内","recommendReason":"40字以内","externalUrl":""}]}`,
    user: JSON.stringify({ stops: catalog }),
    maxOutputTokens: 2500,
    temperature: 0.4,
  });

  if (!result.ok) throw new Error(result.reason || "おすすめ提案に失敗しました");

  let parsed: {
    items?: Array<{
      id?: string;
      tip?: string;
      recommendReason?: string;
      externalUrl?: string;
    }>;
  };
  try {
    parsed = parseTravelJsonText(result.text);
  } catch {
    throw new Error("おすすめ提案の応答が不正です");
  }

  const byId = new Map(
    (parsed.items ?? [])
      .filter((i) => i.id)
      .map((i) => [i.id!, i] as const),
  );

  let applied = 0;
  const next = stops.map((s) => {
    const hit = byId.get(s.id);
    if (!hit) return s;
    const tip = hit.tip ? sanitizeText(hit.tip, 600) : undefined;
    const recommendReason = hit.recommendReason
      ? sanitizeText(hit.recommendReason, 400)
      : undefined;
    if (!tip && !recommendReason) return s;
    applied += 1;
    return {
      ...s,
      tip: tip || s.tip,
      recommendReason: recommendReason || s.recommendReason,
      externalUrl: hit.externalUrl
        ? sanitizeText(hit.externalUrl, 400)
        : s.externalUrl,
    };
  });

  if (applied < 1) {
    throw new Error("おすすめ提案を生成できませんでした。しばらくしてから再試行してください。");
  }

  return { stops: next, provider: `${result.provider}:${result.model}` };
}
