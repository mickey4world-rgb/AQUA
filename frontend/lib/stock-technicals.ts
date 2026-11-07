/**
 * 日本株テクニカル（Yahoo 日足から計算）。AI・インテント判定の共通入力。
 * 短期反応は EMA、トレンド確認は中長期 EMA（日足で 1h/5m の二段近似）。
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

export function emaLast(values: number[], period: number): number {
  const series = emaSeries(values, period);
  return series.length ? series[series.length - 1]! : 0;
}

/** 短期EMAが長期EMAを上抜け／下抜け（直前バー比較） */
export function emaCross(
  closes: number[],
  fast = 5,
  slow = 25,
): "golden" | "dead" | "none" {
  if (closes.length < slow + 2) return "none";
  const fastLine = emaSeries(closes, fast);
  const slowLine = emaSeries(closes, slow);
  const i = fastLine.length - 1;
  const prev = i - 1;
  if (prev < 0) return "none";
  const nowDiff = fastLine[i]! - slowLine[i]!;
  const prevDiff = fastLine[prev]! - slowLine[prev]!;
  if (prevDiff <= 0 && nowDiff > 0) return "golden";
  if (prevDiff >= 0 && nowDiff < 0) return "dead";
  return "none";
}

/** 短期 > 中期 > 長期（強い上昇トレンド） */
export function isPerfectOrderBull(
  closes: number[],
  fast = 5,
  mid = 25,
  slow = 75,
): boolean {
  if (closes.length < slow) return false;
  const eFast = emaLast(closes, fast);
  const eMid = emaLast(closes, mid);
  const eSlow = emaLast(closes, slow);
  return eFast > eMid && eMid > eSlow && eSlow > 0;
}

/** ATR（Wilder 近似: True Range の単純平均） */
export function atr(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14,
): number {
  const n = Math.min(highs.length, lows.length, closes.length);
  if (n < period + 1) return 0;
  const trs: number[] = [];
  for (let i = 1; i < n; i++) {
    const h = highs[i]!;
    const l = lows[i]!;
    const prevClose = closes[i - 1]!;
    trs.push(Math.max(h - l, Math.abs(h - prevClose), Math.abs(l - prevClose)));
  }
  return sma(trs, period);
}

/**
 * 直近 ATR ÷ その直前期間の ATR。
 * >1 ならボラ拡大（売買活発化の材料）。不足時は 1。
 */
export function atrExpansionRatio(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14,
): number {
  const n = Math.min(highs.length, lows.length, closes.length);
  if (n < period * 2 + 2) return 1;
  const now = atr(highs, lows, closes, period);
  const cut = n - period;
  const prior = atr(
    highs.slice(0, cut),
    lows.slice(0, cut),
    closes.slice(0, cut),
    period,
  );
  if (!(prior > 0) || !(now > 0)) return 1;
  return now / prior;
}

export type BbRegime = "squeeze" | "expansion" | "normal";

/** 直近 BB 幅と過去幅の中央値比較でスクイーズ／エクスパンション */
export function bollingerRegime(
  closes: number[],
  period = 20,
  mult = 2,
  lookback = 20,
): BbRegime {
  if (closes.length < period + lookback) return "normal";
  const widths: number[] = [];
  for (let end = period; end <= closes.length; end++) {
    const slice = closes.slice(0, end);
    widths.push(bollinger(slice, period, mult).widthPct);
  }
  const recent = widths[widths.length - 1] ?? 0;
  const hist = widths.slice(-(lookback + 1), -1);
  if (hist.length === 0 || !(recent > 0)) return "normal";
  const sorted = [...hist].sort((a, b) => a - b);
  const mid = sorted[Math.floor(sorted.length / 2)] ?? recent;
  if (mid <= 0) return "normal";
  if (recent <= mid * 0.75) return "squeeze";
  if (recent >= mid * 1.35) return "expansion";
  return "normal";
}

/** スクイーズ後のエクスパンション＋終値がバンド外＝順張りブレイク */
export function bollingerBreakout(
  closes: number[],
  period = 20,
  mult = 2,
): { up: boolean; down: boolean; regime: BbRegime } {
  const regime = bollingerRegime(closes, period, mult);
  const bb = bollinger(closes, period, mult);
  const px = closes[closes.length - 1] ?? 0;
  const expanding = regime === "expansion" || regime === "normal";
  // 直前がスクイーズ気味だったか（幅が急拡大）
  const prior =
    closes.length > period + 5
      ? bollinger(closes.slice(0, -1), period, mult)
      : bb;
  const widened = bb.widthPct >= prior.widthPct * 1.15;
  const up =
    expanding &&
    widened &&
    px > 0 &&
    bb.upper > 0 &&
    px >= bb.upper;
  const down =
    expanding &&
    widened &&
    px > 0 &&
    bb.lower > 0 &&
    px <= bb.lower;
  return { up, down, regime };
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
