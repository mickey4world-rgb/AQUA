/**
 * 旅行会社資料 → 行程ストップ抽出 + 無料ジオコーディング（Nominatim）
 * LLM: 安価 OpenAI 優先 → Gemini → ルール簡易抽出（最後の砦）
 */
import { randomUUID } from "crypto";
import { sanitizeText } from "@/lib/server/security";
import {
  generateTravelJson,
  isTravelLlmConfigured,
  parseTravelJsonText,
} from "@/lib/server/travel-llm";
import {
  heuristicGeocodeQuery,
  parseTravelMaterialHeuristic,
} from "@/lib/server/travel-parse-heuristic";
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
  options?: { timeoutMs?: number },
): Promise<{ lat: number; lon: number; displayName?: string } | null> {
  const q = query.trim();
  if (!q) return null;
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
  const controller = new AbortController();
  const timeoutMs = options?.timeoutMs ?? 4_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "AquaTravelApp/1.0 (personal; contact=aquacore.net)",
      },
      cache: "no-store",
      signal: controller.signal,
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
  } finally {
    clearTimeout(timer);
  }
}

async function geocodeStops(
  pending: Array<{ stop: TravelStop; query: string }>,
  options?: { maxGeocode?: number; delayMs?: number },
): Promise<TravelStop[]> {
  const maxGeocode = options?.maxGeocode ?? 0;
  const delayMs = options?.delayMs ?? 700;
  const stops: TravelStop[] = [];
  let geocodeCount = 0;
  for (let i = 0; i < pending.length; i += 1) {
    const item = pending[i]!;
    let geo: { lat: number; lon: number; displayName?: string } | null = null;
    if (geocodeCount < maxGeocode && item.query.trim()) {
      if (geocodeCount > 0) await new Promise((r) => setTimeout(r, delayMs));
      geo = await geocodePlace(item.query, { timeoutMs: 3500 });
      geocodeCount += 1;
    }
    stops.push({
      ...item.stop,
      address: item.stop.address
        ? item.stop.address
        : geo?.displayName
          ? sanitizeText(geo.displayName, 200)
          : undefined,
      lat: geo?.lat ?? item.stop.lat,
      lon: geo?.lon ?? item.stop.lon,
    });
  }
  return stops;
}

function rawToPending(
  raw: ParsedStopRaw,
  index: number,
  destinationHint?: string,
): { stop: TravelStop; query: string } | null {
  const name = sanitizeText(raw.name ?? "", 120);
  if (!name) return null;
  const kind = asKind(raw.kind);
  const transportMode =
    asTransport(raw.transportMode) ||
    (kind === "transport" ? ("other" as const) : undefined);
  const query =
    sanitizeText(raw.queryForGeocode ?? "", 160) ||
    [destinationHint, name, raw.address].filter(Boolean).join(" ");
  return {
    query,
    stop: {
      id: randomUUID(),
      dayIndex: Number.isFinite(raw.dayIndex) ? Math.max(0, Number(raw.dayIndex)) : 0,
      order: Number.isFinite(raw.order) ? Number(raw.order) : index,
      name,
      kind,
      transportMode,
      date: raw.date ? sanitizeText(raw.date, 32) : undefined,
      timeLabel: raw.timeLabel ? sanitizeText(raw.timeLabel, 32) : undefined,
      address: raw.address ? sanitizeText(raw.address, 200) : undefined,
      note: raw.note ? sanitizeText(raw.note, 600) : undefined,
      sourceSnippet: raw.sourceSnippet
        ? sanitizeText(raw.sourceSnippet, 400)
        : undefined,
    },
  };
}

export async function parseTravelMaterial(input: {
  text: string;
  destinationHint?: string;
  startDate?: string;
  endDate?: string;
  /** SWA タイムアウト回避: 判読時は 0 推奨。座標は別 API で付与 */
  maxGeocode?: number;
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
  const maxGeocode = input.maxGeocode ?? 0;

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

  let llmError = "";
  if (isTravelLlmConfigured()) {
    const result = await generateTravelJson({
      system,
      user,
      maxOutputTokens: 3500,
      temperature: 0.2,
    });

    if (result.ok) {
      try {
        const parsed = parseTravelJsonText<{
          tripTitle?: string;
          summary?: string;
          stops?: ParsedStopRaw[];
        }>(result.text);
        const rawStops = Array.isArray(parsed.stops) ? parsed.stops : [];
        const pending = rawStops
          .slice(0, 60)
          .map((raw, i) => rawToPending(raw, i, input.destinationHint))
          .filter((v): v is NonNullable<typeof v> => Boolean(v));

        if (pending.length >= 1) {
          const stops = await geocodeStops(pending, { maxGeocode });
          return {
            stops,
            tripTitle: parsed.tripTitle
              ? sanitizeText(parsed.tripTitle, 120)
              : undefined,
            summary: parsed.summary
              ? sanitizeText(parsed.summary, 800)
              : undefined,
            provider: `${result.provider}:${result.model}`,
          };
        }
        llmError = "AI応答に有効な地点がありませんでした";
      } catch {
        llmError = "AI応答の JSON 解析に失敗しました";
      }
    } else {
      llmError = result.reason;
    }
  } else {
    llmError = "Gemini / Azure OpenAI 未設定";
  }

  const heuristic = parseTravelMaterialHeuristic({
    text,
    destinationHint: input.destinationHint,
    startDate: input.startDate,
  });
  if (heuristic.stops.length < 1) {
    throw new Error(
      `資料から観光ポイントを抽出できませんでした（${llmError}）。テキスト付きしおりか、時刻付き行程の抜粋を試してください。`,
    );
  }

  const pending = heuristic.stops.map((stop) => ({
    stop,
    query: heuristicGeocodeQuery(stop, input.destinationHint),
  }));
  const stops = await geocodeStops(pending, { maxGeocode });
  return {
    stops,
    tripTitle: heuristic.tripTitle,
    summary: heuristic.summary,
    provider: `heuristic(fallback; ${llmError.slice(0, 120)})`,
  };
}

/** 既存ストップに座標を付与（判読後の第2段・SWA タイムアウト回避用） */
export async function geocodeTravelStops(
  stops: TravelStop[],
  options?: {
    destinationHint?: string;
    maxGeocode?: number;
  },
): Promise<{ stops: TravelStop[]; updated: number }> {
  const maxGeocode = options?.maxGeocode ?? 8;
  const pending = stops.map((stop) => ({
    stop,
    query:
      stop.lat != null && stop.lon != null
        ? ""
        : heuristicGeocodeQuery(stop, options?.destinationHint),
  }));
  // Prefer filling stops that lack coords first
  const need = pending.filter((p) => !p.stop.lat && p.query);
  const have = pending.filter((p) => p.stop.lat != null || !p.query);
  const ordered = [...need, ...have];
  const next = await geocodeStops(ordered, {
    maxGeocode,
    delayMs: 650,
  });
  // restore original order by id
  const byId = new Map(next.map((s) => [s.id, s]));
  const merged = stops.map((s) => byId.get(s.id) ?? s);
  let updated = 0;
  for (const s of merged) {
    const prev = stops.find((p) => p.id === s.id);
    if (prev && prev.lat == null && s.lat != null) updated += 1;
  }
  return { stops: merged, updated };
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
