/**
 * LLM 不通時の行程ルール抽出（日本語しおり向け）
 * 完璧ではないが「完全に止まらない」ための最終手段。
 */
import { randomUUID } from "crypto";
import { sanitizeText } from "@/lib/server/security";
import { buildGeocodeCandidates } from "@/lib/travel-geocode-query";
import type { TravelStop, TravelStopKind, TravelTransportMode } from "@/lib/types/travel";

const TIME_LINE_RE =
  /^[\s　]*(?:◆|●|・|■|□|-|–)?\s*(\d{1,2})[:：](\d{2})\s*[〜~\-－–]?\s*(?:(\d{1,2})[:：](\d{2}))?\s*(.+)$/;

function inferKind(name: string): TravelStopKind {
  if (/ホテル|宿|旅館|チェックイン|チェックアウト|宿泊/.test(name)) return "hotel";
  if (/昼食|夕食|朝食|ランチ|ディナー|食事|レストラン|食堂/.test(name)) return "meal";
  if (/新幹線|特急|電車|バス|飛行機|空港|フェリー|移動|送迎|乗車/.test(name)) {
    return "transport";
  }
  if (/自由|解散|各自/.test(name)) return "free";
  return "sight";
}

function inferTransport(name: string): TravelTransportMode | undefined {
  if (/徒歩|ウォーク/.test(name)) return "walk";
  if (/新幹線|特急|電車|列車|JR|メトロ|地下鉄/.test(name)) return "train";
  if (/バス|観光バス/.test(name)) return "bus";
  if (/タクシー/.test(name)) return "taxi";
  if (/車|ハイヤー|自家用/.test(name)) return "car";
  if (/飛行機|空路|エア|フライト/.test(name)) return "plane";
  if (/船|フェリー|クルーズ/.test(name)) return "ship";
  if (/自転車|バイク/.test(name)) return "bike";
  return undefined;
}

function addDaysIso(iso: string | undefined, dayIndex: number): string | undefined {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return undefined;
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  dt.setUTCDate(dt.getUTCDate() + dayIndex);
  return dt.toISOString().slice(0, 10);
}

function cleanName(raw: string): string {
  return sanitizeText(
    raw
      .replace(/[【】\[\]（）()]/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
    120,
  );
}

export function heuristicGeocodeQuery(
  stop: TravelStop,
  destinationHint?: string,
): string {
  return (
    buildGeocodeCandidates(stop, destinationHint)[0] ||
    [destinationHint, stop.name, stop.address].filter(Boolean).join(" ")
  );
}

/**
 * 日見出しと時刻行を拾ってストップ配列を作る。
 */
export function parseTravelMaterialHeuristic(input: {
  text: string;
  destinationHint?: string;
  startDate?: string;
}): { stops: TravelStop[]; tripTitle?: string; summary?: string } {
  const text = input.text.replace(/\r\n/g, "\n");
  const lines = text.split("\n").map((l) => l.trimEnd());

  type Seg = { dayIndex: number; lines: string[] };
  const segs: Seg[] = [];
  let current: Seg = { dayIndex: 0, lines: [] };
  segs.push(current);

  for (const line of lines) {
    const dayMatch =
      /(?:第?\s*)?(\d{1,2})\s*日\s*目|(?:Day|DAY)\s*(\d{1,2})/i.exec(line);
    if (dayMatch && line.length < 48) {
      const n = Number(dayMatch[1] || dayMatch[2]);
      if (Number.isFinite(n) && n >= 1) {
        current = { dayIndex: n - 1, lines: [] };
        segs.push(current);
        continue;
      }
    }
    current.lines.push(line);
  }

  const stops: TravelStop[] = [];

  for (const seg of segs) {
    let order = 0;
    for (const line of seg.lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.length < 2) continue;
      if (/^[-_=]{3,}$/.test(trimmed)) continue;

      const timeMatch = TIME_LINE_RE.exec(trimmed);
      if (timeMatch) {
        const hh = timeMatch[1]!.padStart(2, "0");
        const mm = timeMatch[2]!.padStart(2, "0");
        const rest = cleanName(timeMatch[5] || "");
        if (!rest || rest.length < 2) continue;
        const kind = inferKind(rest);
        const transport = inferTransport(rest);
        stops.push({
          id: randomUUID(),
          dayIndex: seg.dayIndex,
          order: order++,
          name: rest.slice(0, 80),
          kind,
          transportMode:
            kind === "transport" ? transport || "other" : transport,
          date: addDaysIso(input.startDate, seg.dayIndex),
          timeLabel: `${hh}:${mm}`,
          sourceSnippet: sanitizeText(trimmed, 200),
        });
        continue;
      }

      if (
        /観光|訪問|見学|到着|出発|ホテル|昼食|夕食|朝食/.test(trimmed) &&
        trimmed.length < 80
      ) {
        const name = cleanName(
          trimmed.replace(/^(?:◆|●|・|■|□|-)?\s*/, ""),
        );
        if (!name || name.length < 2) continue;
        if (/^日程|^行程|^ご案内|^注意|^※|^備考/.test(name)) continue;
        const kind = inferKind(name);
        stops.push({
          id: randomUUID(),
          dayIndex: seg.dayIndex,
          order: order++,
          name: name.slice(0, 80),
          kind,
          transportMode:
            kind === "transport" ? inferTransport(name) || "other" : undefined,
          date: addDaysIso(input.startDate, seg.dayIndex),
          sourceSnippet: sanitizeText(trimmed, 200),
        });
      }
    }
  }

  if (stops.length < 1) {
    return { stops: [] };
  }

  return {
    stops: stops.slice(0, 60),
    tripTitle: input.destinationHint
      ? `${sanitizeText(input.destinationHint, 40)}の旅`
      : undefined,
    summary:
      "AI解析が一時利用できなかったため、しおり文言から簡易抽出した行程です。内容を確認・修正してください。",
  };
}
