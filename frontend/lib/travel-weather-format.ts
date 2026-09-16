import type { TravelStopWeather } from "@/lib/types/travel";

export function formatTravelWeatherLine(w: TravelStopWeather): string {
  const temp =
    w.tempMinC != null && w.tempMaxC != null
      ? `${Math.round(w.tempMinC)}〜${Math.round(w.tempMaxC)}℃`
      : w.tempMaxC != null
        ? `${Math.round(w.tempMaxC)}℃`
        : "気温—";
  const humid = w.humidityPct != null ? `湿度 ${Math.round(w.humidityPct)}%` : null;
  const rain =
    w.precipMm != null
      ? `降水 ${w.precipMm}mm` +
        (w.precipProbPct != null ? `（確率 ${Math.round(w.precipProbPct)}%）` : "")
      : null;
  const wind = w.windMaxKmh != null ? `風 ${Math.round(w.windMaxKmh)}km/h` : null;
  const uv = w.uvIndexMax != null ? `UV ${w.uvIndexMax}` : null;
  const src = w.source === "archive" ? "実測" : "予報";
  return [w.label, temp, humid, rain, wind, uv, src]
    .filter(Boolean)
    .join(" · ");
}
