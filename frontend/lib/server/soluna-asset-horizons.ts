/**
 * 多期間（6か月〜昨日）の値動きから当日の方向性スコアを作る。
 * bitFlyer に OHLC API が無いため CoinGecko の JPY チャートを利用（短時間キャッシュ）。
 */

export type HorizonMomentum = {
  change1d: number;
  change1w: number;
  change1m: number;
  change3m: number;
  change6m: number;
  /** -50 〜 +50。短期ほど重み大 */
  score: number;
  summary: string;
};

type CoinGeckoId = "bitcoin" | "ethereum" | "ripple" | "stellar";

const PRODUCT_TO_COINGECKO: Record<string, CoinGeckoId> = {
  BTC_JPY: "bitcoin",
  ETH_JPY: "ethereum",
  XRP_JPY: "ripple",
  XLM_JPY: "stellar",
};

const CACHE_TTL_MS = 20 * 60 * 1000;
const chartCache = new Map<string, { fetchedAt: number; prices: Array<[number, number]> }>();

function pctFromSeries(prices: Array<[number, number]>, daysAgo: number): number {
  if (prices.length < 2) return 0;
  const newest = prices[prices.length - 1]!;
  const targetMs = newest[0] - daysAgo * 24 * 60 * 60 * 1000;
  let best = prices[0]!;
  let bestDiff = Math.abs(best[0] - targetMs);
  for (const point of prices) {
    const diff = Math.abs(point[0] - targetMs);
    if (diff < bestDiff) {
      best = point;
      bestDiff = diff;
    }
  }
  if (best[1] <= 0) return 0;
  return (newest[1] - best[1]) / best[1];
}

function scoreFromChanges(h: Omit<HorizonMomentum, "score" | "summary">): number {
  // 短期ほど当日の売買タイミングに効かせる
  const raw =
    Math.tanh(h.change1d * 18) * 22 +
    Math.tanh(h.change1w * 10) * 14 +
    Math.tanh(h.change1m * 6) * 8 +
    Math.tanh(h.change3m * 3) * 4 +
    Math.tanh(h.change6m * 2) * 2;
  return Math.round(Math.max(-50, Math.min(50, raw)));
}

function formatPct(v: number): string {
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
}

async function fetchChartPrices(coinId: CoinGeckoId): Promise<Array<[number, number]>> {
  const cached = chartCache.get(coinId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.prices;
  }

  const url =
    `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart` +
    `?vs_currency=jpy&days=180&interval=daily`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`coingecko ${coinId} ${res.status}`);
  }
  const data = (await res.json()) as { prices?: Array<[number, number]> };
  const prices = (data.prices ?? []).filter((p) => p[1] > 0);
  chartCache.set(coinId, { fetchedAt: Date.now(), prices });
  return prices;
}

export async function fetchHorizonMomentum(product: string): Promise<HorizonMomentum> {
  const coinId = PRODUCT_TO_COINGECKO[product];
  if (!coinId) {
    return {
      change1d: 0,
      change1w: 0,
      change1m: 0,
      change3m: 0,
      change6m: 0,
      score: 0,
      summary: "多期間データなし",
    };
  }

  try {
    const prices = await fetchChartPrices(coinId);
    const change1d = pctFromSeries(prices, 1);
    const change1w = pctFromSeries(prices, 7);
    const change1m = pctFromSeries(prices, 30);
    const change3m = pctFromSeries(prices, 90);
    const change6m = pctFromSeries(prices, 180);
    const base = { change1d, change1w, change1m, change3m, change6m };
    const score = scoreFromChanges(base);
    const summary = [
      `1d ${formatPct(change1d)}`,
      `1w ${formatPct(change1w)}`,
      `1m ${formatPct(change1m)}`,
      `3m ${formatPct(change3m)}`,
      `6m ${formatPct(change6m)}`,
      `多期間 ${score >= 0 ? "+" : ""}${score}`,
    ].join(" / ");
    return { ...base, score, summary };
  } catch {
    return {
      change1d: 0,
      change1w: 0,
      change1m: 0,
      change3m: 0,
      change6m: 0,
      score: 0,
      summary: "多期間取得失敗",
    };
  }
}

export async function fetchHorizonMomentums(
  products: string[],
): Promise<Map<string, HorizonMomentum>> {
  const entries = await Promise.all(
    products.map(async (product) => [product, await fetchHorizonMomentum(product)] as const),
  );
  return new Map(entries);
}
