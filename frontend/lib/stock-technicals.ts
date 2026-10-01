/**
 * 日本株テクニカル（Yahoo 日足から計算）。AI・インテント判定の共通入力。
 */
export function sma(values: number[], period: number): number {
  if (values.length < period || period <= 0) return 0;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

export function emaSeries(values: number[], period: number): number[] {
  if (values.length === 0 || period <= 0) return [];
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values[0]!;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    prev = i === 0 ? v : v * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

/** RSI(period) 0–100。不足時は 50 */
export function rsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i]! - closes[i - 1]!;
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

export function bollinger(
  closes: number[],
  period = 20,
  mult = 2,
): { mid: number; upper: number; lower: number; widthPct: number } {
  const mid = sma(closes, period);
  if (mid <= 0 || closes.length < period) {
    return { mid: 0, upper: 0, lower: 0, widthPct: 0 };
  }
  const slice = closes.slice(-period);
  const variance =
    slice.reduce((s, v) => s + (v - mid) ** 2, 0) / period;
  const std = Math.sqrt(variance);
  const upper = mid + mult * std;
  const lower = mid - mult * std;
  return {
    mid,
    upper,
    lower,
    widthPct: (upper - lower) / mid,
  };
}

export type MacdSnapshot = {
  macd: number;
  signal: number;
  histogram: number;
  cross: "golden" | "dead" | "none";
};

export function macd(
  closes: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9,
): MacdSnapshot {
  if (closes.length < slow + signalPeriod) {
    return { macd: 0, signal: 0, histogram: 0, cross: "none" };
  }
  const emaFast = emaSeries(closes, fast);
  const emaSlow = emaSeries(closes, slow);
  const macdLine = emaFast.map((v, i) => v - emaSlow[i]!);
  const signalLine = emaSeries(macdLine, signalPeriod);
  const i = macdLine.length - 1;
  const prev = i - 1;
  const macdNow = macdLine[i]!;
  const signalNow = signalLine[i]!;
  const hist = macdNow - signalNow;
  let cross: MacdSnapshot["cross"] = "none";
  if (prev >= 0) {
    const prevDiff = macdLine[prev]! - signalLine[prev]!;
    if (prevDiff <= 0 && hist > 0) cross = "golden";
    if (prevDiff >= 0 && hist < 0) cross = "dead";
  }
  return { macd: macdNow, signal: signalNow, histogram: hist, cross };
}

export function maDeviationPct(price: number, ma: number): number {
  if (ma <= 0) return 0;
  return ((price - ma) / ma) * 100;
}

export function volumeSpikeRatio(
  volumes: number[],
  lookback = 5,
): number {
  if (volumes.length < lookback + 1) return 1;
  const today = volumes[volumes.length - 1] ?? 0;
  const avg = sma(volumes.slice(0, -1), lookback);
  if (avg <= 0) return 1;
  return today / avg;
}
