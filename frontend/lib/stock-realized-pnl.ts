/**
 * 日本株売り約定の実現損益を推定・補完する。
 * 発注報告に realizedPnlYen が無い過去ログでも、理由文・単価から復元する。
 */
import type { StockBrokerOrderRecord } from "@/lib/types/stock-broker-trade";

const FORECAST_RE = /実現見込み\s*([+-]?\d[\d,]*)\s*円/;
const PCT_RE = /([+-]\d+(?:\.\d+)?)\s*%/;
const COST_MARK_RE =
  /取得\s*([\d.]+)\s*円\s*[→\-]\s*時価\s*([\d.]+)\s*円/;

export function parseYenNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(String(raw).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** 理由文から「実現見込み-1234円」を抜く */
export function parseForecastRealizedPnlYen(
  reason: string | null | undefined,
): number | null {
  if (!reason) return null;
  const m = reason.match(FORECAST_RE);
  if (!m) return null;
  return parseYenNumber(m[1]);
}

/** 理由文の「取得123円→時価120円」 */
export function parseCostAndMarkFromReason(
  reason: string | null | undefined,
): { cost: number; mark: number } | null {
  if (!reason) return null;
  const m = reason.match(COST_MARK_RE);
  if (!m) return null;
  const cost = Number(m[1]);
  const mark = Number(m[2]);
  if (!(cost > 0) || !(mark > 0)) return null;
  return { cost, mark };
}

/**
 * 売り1件の実現損益（円）。保存値が最優先。
 * 無ければ理由文 → 単価差 → 直近買い単価の順で推定。
 */
export function estimateSellRealizedPnlYen(input: {
  order: StockBrokerOrderRecord;
  /** ウォッチや保有の取得単価 */
  costPriceYen?: number | null;
  /** 売却時点の参照単価（報告 priceYen など） */
  fillPriceYen?: number | null;
  /** 同銘柄の直近買い報告の単価 */
  priorBuyPriceYen?: number | null;
}): number | null {
  const o = input.order;
  if (o.side !== "sell") return null;
  if (typeof o.realizedPnlYen === "number" && Number.isFinite(o.realizedPnlYen)) {
    return Math.round(o.realizedPnlYen);
  }

  const fromReason = parseForecastRealizedPnlYen(o.reason);
  if (fromReason != null) return Math.round(fromReason);

  const parsed = parseCostAndMarkFromReason(o.reason);
  if (parsed && o.qty > 0) {
    return Math.round((parsed.mark - parsed.cost) * o.qty);
  }

  const fill =
    (typeof input.fillPriceYen === "number" && input.fillPriceYen > 0
      ? input.fillPriceYen
      : null) ??
    (typeof o.priceYen === "number" && o.priceYen > 0 ? o.priceYen : null);
  const cost =
    (typeof input.costPriceYen === "number" && input.costPriceYen > 0
      ? input.costPriceYen
      : null) ??
    (typeof o.costPriceYen === "number" && o.costPriceYen > 0
      ? o.costPriceYen
      : null) ??
    (typeof input.priorBuyPriceYen === "number" && input.priorBuyPriceYen > 0
      ? input.priorBuyPriceYen
      : null);

  if (fill != null && cost != null && o.qty > 0) {
    return Math.round((fill - cost) * o.qty);
  }

  // 理由に ±X% があり取得単価が分かるとき（旧ログの「-3.2%」など）
  if (cost != null && o.qty > 0 && o.reason) {
    const pctM = o.reason.match(PCT_RE);
    if (pctM) {
      const pct = Number(pctM[1]);
      if (Number.isFinite(pct)) {
        return Math.round(cost * (pct / 100) * o.qty);
      }
    }
    // 「下落 3%」「含み損3.5%」など符号なし＋損ニュアンス
    const lossPct = o.reason.match(
      /(?:下落|含み損|損失|マイナス|▲|△)\s*(\d+(?:\.\d+)?)\s*%/,
    );
    if (lossPct) {
      const pct = -Number(lossPct[1]);
      if (Number.isFinite(pct)) {
        return Math.round(cost * (pct / 100) * o.qty);
      }
    }
  }

  return null;
}

/**
 * 注文列を時系列で走査し、売りに realizedPnlYen / 単価を補完する。
 * チャート・前日サマリ・取引表の共通入口。
 */
export function enrichBrokerOrdersForRealizedPnl(
  orders: StockBrokerOrderRecord[],
  options?: {
    costBySymbol?: Map<string, number>;
  },
): StockBrokerOrderRecord[] {
  const sorted = [...orders].sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const lastBuyPrice = new Map<string, number>();
  const out: StockBrokerOrderRecord[] = [];

  for (const o of sorted) {
    if (
      o.side === "buy" &&
      (o.status === "submitted" || o.status === "dry_run") &&
      typeof o.priceYen === "number" &&
      o.priceYen > 0
    ) {
      lastBuyPrice.set(o.symbol, o.priceYen);
    }

    if (o.side !== "sell" || (o.status !== "submitted" && o.status !== "dry_run")) {
      out.push(o);
      continue;
    }

    const costHint =
      options?.costBySymbol?.get(o.symbol) ??
      lastBuyPrice.get(o.symbol) ??
      null;
    const estimated = estimateSellRealizedPnlYen({
      order: o,
      costPriceYen: costHint,
      fillPriceYen: o.priceYen,
      priorBuyPriceYen: lastBuyPrice.get(o.symbol) ?? null,
    });

    if (estimated == null && o.realizedPnlYen != null) {
      out.push(o);
      continue;
    }
    if (estimated == null) {
      out.push(o);
      continue;
    }
    if (o.realizedPnlYen === estimated) {
      out.push(o);
      continue;
    }
    out.push({ ...o, realizedPnlYen: estimated });
  }

  // 呼び出し元の新しい順を保つ
  const byId = new Map(out.map((o) => [o.id, o]));
  return orders.map((o) => byId.get(o.id) ?? o);
}

/** 売り理由に埋め込む実現見込みテキスト（過去ログ復元用） */
export function formatSellRealizedForecast(input: {
  costPriceYen: number;
  markPriceYen: number;
  qty: number;
}): string {
  const pnl = Math.round(
    (input.markPriceYen - input.costPriceYen) * input.qty,
  );
  const sign = pnl > 0 ? "+" : "";
  return `実現見込み${sign}${pnl}円(取得${input.costPriceYen}円→時価${input.markPriceYen}円)`;
}
