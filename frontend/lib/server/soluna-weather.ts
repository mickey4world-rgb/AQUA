/**
 * 天気予報（Open-Meteo・APIキー不要）— Gemini grounding が落ちても使える
 */
import { resolvePlaceQuery, DEFAULT_SORT_PLACE } from "@/lib/eagle-eye-places";

const WEATHER_RE =
  /天気|天候|予報|気温|降水|晴れ|くもり|曇り|雨|雪|あられ|雷|湿度|風速|紫外線|花粉|黄砂|猛暑|猛寒|積雪|あしたの空|明日の空|きょうの空|今日の空|傘|服装|気象/i;

const WMO_JA: Record<number, string> = {
  0: "快晴",
  1: "おおむね晴れ",
  2: "ところにより曇り",
  3: "曇り",
  45: "霧",
  48: "着氷性の霧",
  51: "霧雨（弱）",
  53: "霧雨",
  55: "霧雨（強）",
  61: "雨（弱）",
  63: "雨",
  65: "雨（強）",
  71: "雪（弱）",
  73: "雪",
  75: "雪（強）",
  80: "にわか雨（弱）",
  81: "にわか雨",
  82: "にわか雨（強）",
  95: "雷雨",
  96: "雷雨（ひょう）",
  99: "激しい雷雨",
};

export function isWeatherQuestion(message: string): boolean {
  return WEATHER_RE.test(message.trim());
}

function weatherLabel(code: number | undefined): string {
  if (code == null || Number.isNaN(code)) return "不明";
  return WMO_JA[code] ?? `天候コード ${code}`;
}

function resolveWeatherPlace(message: string): { lat: number; lon: number; label: string } {
  const place = resolvePlaceQuery(message);
  if (place) return place;
  // 「天気」だけのときは東京を既定
  return DEFAULT_SORT_PLACE;
}

export async function fetchOpenMeteoWeatherContext(
  message: string,
  options?: { force?: boolean; compact?: boolean },
): Promise<string | null> {
  if (!options?.force && !isWeatherQuestion(message)) return null;

  const place = resolveWeatherPlace(message);
  const compact = options?.compact === true;
  const url =
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${place.lat}&longitude=${place.lon}` +
    `&current=temperature_2m,weather_code,precipitation,wind_speed_10m,relative_humidity_2m` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max` +
    `&timezone=Asia%2FTokyo&forecast_days=${compact ? 2 : 3}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      next: { revalidate: 600 },
    });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      current?: {
        time?: string;
        temperature_2m?: number;
        weather_code?: number;
        precipitation?: number;
        wind_speed_10m?: number;
        relative_humidity_2m?: number;
      };
      daily?: {
        time?: string[];
        weather_code?: number[];
        temperature_2m_max?: number[];
        temperature_2m_min?: number[];
        precipitation_sum?: number[];
        precipitation_probability_max?: number[];
      };
    };

    const cur = data.current;
    const daily = data.daily;

    if (compact && cur) {
      return [
        `## 周辺状況（天気 · ${place.label}）`,
        `いま ${weatherLabel(cur.weather_code)} · ${cur.temperature_2m ?? "—"}℃` +
          ` · 降水 ${cur.precipitation ?? 0} mm` +
          ` · 風 ${cur.wind_speed_10m ?? "—"} km/h`,
        "必要なら会話のきっかけや服装の一言に使ってよい。質問されていない限り長く話さない。",
      ].join("\n");
    }

    const lines: string[] = [
      `## 天気予報（Open-Meteo · ${place.label} · JST）`,
    ];

    if (cur) {
      lines.push(
        `いま: ${weatherLabel(cur.weather_code)} · ${cur.temperature_2m ?? "—"}℃` +
          ` · 湿度 ${cur.relative_humidity_2m ?? "—"}% · 風速 ${cur.wind_speed_10m ?? "—"} km/h` +
          ` · 降水 ${cur.precipitation ?? 0} mm`,
      );
    }

    if (daily?.time?.length) {
      lines.push("今後3日:");
      for (let i = 0; i < Math.min(3, daily.time.length); i += 1) {
        const day = daily.time[i];
        const code = daily.weather_code?.[i];
        const max = daily.temperature_2m_max?.[i];
        const min = daily.temperature_2m_min?.[i];
        const rain = daily.precipitation_sum?.[i];
        const pop = daily.precipitation_probability_max?.[i];
        lines.push(
          `- ${day}: ${weatherLabel(code)} · ${min ?? "—"}〜${max ?? "—"}℃` +
            ` · 降水合計 ${rain ?? 0} mm` +
            (pop != null ? ` · 降水確率最大 ${pop}%` : ""),
        );
      }
    }

    lines.push(
      "出典: Open-Meteo（無料公開API）。会話では数値をかみ砕いて伝え、断定しすぎない。",
    );
    return lines.join("\n");
  } catch (error) {
    console.warn("[soluna-weather] fetch failed", error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** 音声モード用: 質問に関係なく軽い現地天気を常時把握 */
export async function fetchAmbientWeatherBrief(
  message?: string,
): Promise<string | null> {
  const query =
    message && isWeatherQuestion(message) ? message : "東京の天気と気温";
  return fetchOpenMeteoWeatherContext(query, {
    force: true,
    compact: !message || !isWeatherQuestion(message),
  });
}
