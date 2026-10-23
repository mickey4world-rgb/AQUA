/**
 * 証券アプリの約定履歴から補完する LIVE 約定（Costs 実現損益用）。
 * bridge が realizedPnlYen を保存していなかった期間の不足分。
 * 完全架空データではない — ユーザー提示の約定明細に基づく。
 */
import type { StockBrokerOrderRecord } from "@/lib/types/stock-broker-trade";

export type StockBrokerStatementFill = {
  /** JST 約定時刻 yyyy-MM-dd HH:mm:ss */
  jstAt: string;
  symbol: string;
  symbolName: string;
  side: "buy" | "sell";
  priceYen: number;
  qty: number;
  /** 受渡金額（手数料込み）。売り実現 = 売受渡 − 対応買い受渡 */
  settlementYen: number;
};

/**
 * Mickey 提示の約定（2026-10-20〜23）。時系列順。
 * 20日: 1963/6526/3903 を短期で売って赤字になった失敗日。
 */
export const STOCK_BROKER_STATEMENT_FILLS: StockBrokerStatementFill[] = [
  // --- 10/20 買い → 即売り（失敗）---
  {
    jstAt: "2026-10-20 09:15:18",
    symbol: "3903",
    symbolName: "gumi",
    side: "buy",
    priceYen: 196,
    qty: 100,
    settlementYen: 19_655,
  },
  {
    jstAt: "2026-10-20 09:15:18",
    symbol: "6526",
    symbolName: "ソシオネクスト",
    side: "buy",
    priceYen: 1_861.5,
    qty: 100,
    settlementYen: 186_265,
  },
  {
    jstAt: "2026-10-20 09:15:18",
    symbol: "1963",
    symbolName: "日揮ホールディングス",
    side: "buy",
    priceYen: 2_104,
    qty: 100,
    settlementYen: 210_675,
  },
  {
    jstAt: "2026-10-20 09:20:15",
    symbol: "6526",
    symbolName: "ソシオネクスト",
    side: "sell",
    priceYen: 1_862,
    qty: 100,
    settlementYen: 186_085,
  },
  {
    jstAt: "2026-10-20 09:20:16",
    symbol: "1963",
    symbolName: "日揮ホールディングス",
    side: "sell",
    priceYen: 2_090.5,
    qty: 100,
    settlementYen: 208_775,
  },
  {
    jstAt: "2026-10-20 09:40:44",
    symbol: "3776",
    symbolName: "ブロードバンドタワー",
    side: "buy",
    priceYen: 255,
    qty: 100,
    settlementYen: 25_555,
  },
  {
    jstAt: "2026-10-20 12:30:00",
    symbol: "3903",
    symbolName: "gumi",
    side: "sell",
    priceYen: 193,
    qty: 100,
    settlementYen: 19_245,
  },
  // --- 10/21 ---
  {
    jstAt: "2026-10-21 09:15:18",
    symbol: "3776",
    symbolName: "ブロードバンドタワー",
    side: "buy",
    priceYen: 252,
    qty: 100,
    settlementYen: 25_255,
  },
  {
    jstAt: "2026-10-21 09:15:19",
    symbol: "3903",
    symbolName: "gumi",
    side: "buy",
    priceYen: 193,
    qty: 100,
    settlementYen: 19_355,
  },
  {
    jstAt: "2026-10-21 09:15:19",
    symbol: "1963",
    symbolName: "日揮ホールディングス",
    side: "buy",
    priceYen: 2_082.5,
    qty: 100,
    settlementYen: 208_525,
  },
  {
    jstAt: "2026-10-21 09:15:19",
    symbol: "6526",
    symbolName: "ソシオネクスト",
    side: "buy",
    priceYen: 1_866.5,
    qty: 100,
    settlementYen: 186_765,
  },
  // --- 10/22 ---
  {
    jstAt: "2026-10-22 09:15:22",
    symbol: "3776",
    symbolName: "ブロードバンドタワー",
    side: "buy",
    priceYen: 255,
    qty: 100,
    settlementYen: 25_555,
  },
  {
    jstAt: "2026-10-22 09:15:22",
    symbol: "3903",
    symbolName: "gumi",
    side: "buy",
    priceYen: 194,
    qty: 100,
    settlementYen: 19_455,
  },
  // --- 10/23 ---
  {
    jstAt: "2026-10-23 09:15:46",
    symbol: "3903",
    symbolName: "gumi",
    side: "buy",
    priceYen: 187,
    qty: 100,
    settlementYen: 18_755,
  },
  {
    jstAt: "2026-10-23 09:20:21",
    symbol: "3776",
    symbolName: "ブロードバンドタワー",
    side: "buy",
    priceYen: 243,
    qty: 100,
    settlementYen: 24_355,
  },
  {
    jstAt: "2026-10-23 09:56:23",
    symbol: "4755",
    symbolName: "楽天グループ",
    side: "buy",
    priceYen: 632,
    qty: 100,
    settlementYen: 63_299,
  },
];

/** JST wall clock → ISO UTC */
export function jstWallToIso(jstAt: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(
    jstAt.trim(),
  );
  if (!m) throw new Error(`bad jstAt: ${jstAt}`);
  const [, y, mo, d, h, mi, s] = m;
  // Asia/Tokyo = UTC+9（DST なし）
  const utcMs = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h) - 9,
    Number(mi),
    Number(s),
  );
  return new Date(utcMs).toISOString();
}

function statementOrderId(fill: StockBrokerStatementFill): string {
  const stamp = fill.jstAt.replace(/[-: ]/g, "").slice(0, 14);
  return `stmt-${stamp}-${fill.symbol}-${fill.side}-${fill.qty}`;
}

function fingerprint(o: {
  side: string;
  symbol: string;
  qty: number;
  createdAt: string;
}): string {
  const jst = new Date(o.createdAt).toLocaleString("sv-SE", {
    timeZone: "Asia/Tokyo",
    hour12: false,
  });
  // 分単位（同一分の同銘柄同側は明細1件想定）
  return `${o.side}|${o.symbol}|${o.qty}|${jst.slice(0, 16)}`;
}

type Lot = { settlementYen: number; priceYen: number; qty: number };

/**
 * 受渡ベースで売り実現損益を FIFO 割り当て。
 * 例: 売受渡 186085 − 買受渡 186265 = −180
 */
export function assignStatementRealizedPnl(
  fills: StockBrokerStatementFill[],
): Array<StockBrokerStatementFill & { realizedPnlYen?: number; costPriceYen?: number }> {
  const lots = new Map<string, Lot[]>();
  const out: Array<
    StockBrokerStatementFill & { realizedPnlYen?: number; costPriceYen?: number }
  > = [];

  for (const f of fills) {
    if (f.side === "buy") {
      const q = lots.get(f.symbol) ?? [];
      q.push({
        settlementYen: f.settlementYen,
        priceYen: f.priceYen,
        qty: f.qty,
      });
      lots.set(f.symbol, q);
      out.push({ ...f });
      continue;
    }

    const q = lots.get(f.symbol) ?? [];
    let remain = f.qty;
    let costSettlement = 0;
    let costShares = 0;
    let costPxSum = 0;
    while (remain > 0 && q.length > 0) {
      const lot = q[0];
      const take = Math.min(remain, lot.qty);
      const frac = take / lot.qty;
      costSettlement += lot.settlementYen * frac;
      costPxSum += lot.priceYen * take;
      costShares += take;
      lot.qty -= take;
      lot.settlementYen *= 1 - frac;
      remain -= take;
      if (lot.qty <= 0) q.shift();
    }
    lots.set(f.symbol, q);

    const sellSettlement =
      remain === 0
        ? f.settlementYen
        : f.settlementYen * ((f.qty - remain) / f.qty);
    const realizedPnlYen = Math.round(sellSettlement - costSettlement);
    const costPriceYen =
      costShares > 0 ? Math.round((costPxSum / costShares) * 10) / 10 : undefined;
    out.push({ ...f, realizedPnlYen, costPriceYen });
  }
  return out;
}

export function statementFillsToOrders(
  userId: string,
  fills: StockBrokerStatementFill[] = STOCK_BROKER_STATEMENT_FILLS,
): StockBrokerOrderRecord[] {
  const priced = assignStatementRealizedPnl(fills);
  return priced.map((f) => {
    const createdAt = jstWallToIso(f.jstAt);
    const id = statementOrderId(f);
    const pnlNote =
      f.side === "sell" && typeof f.realizedPnlYen === "number"
        ? ` 実現${f.realizedPnlYen >= 0 ? "+" : ""}${f.realizedPnlYen}円(受渡)`
        : "";
    return {
      id,
      userId,
      intentId: id,
      side: f.side,
      symbol: f.symbol,
      exchange: 27,
      qty: f.qty,
      status: "submitted" as const,
      dryRun: false,
      reason:
        f.side === "sell"
          ? `証券約定補完: ${f.symbolName} 売 @${f.priceYen}円${pnlNote}`
          : `証券約定補完: ${f.symbolName} 買 @${f.priceYen}円`,
      ruleIds: f.side === "sell" ? [47] : [8],
      realizedPnlYen: f.realizedPnlYen,
      priceYen: f.priceYen,
      costPriceYen: f.costPriceYen,
      message: `settlementYen=${f.settlementYen}; source=broker-statement`,
      createdAt,
    };
  });
}

/**
 * Cosmos 報告に無い／損益欠損の売りを、証券明細で補完する。
 * 既存に同フィンガープリントがあり売り損益が既にあれば明細側はスキップ。
 */
export function mergeStockBrokerOrdersWithStatementFills(
  orders: StockBrokerOrderRecord[],
  userId: string,
): StockBrokerOrderRecord[] {
  const supplements = statementFillsToOrders(userId);
  const byFp = new Map<string, StockBrokerOrderRecord>();
  for (const o of orders) {
    if (o.symbol === "_CHECK_") continue;
    byFp.set(fingerprint(o), o);
  }

  const merged = [...orders];
  for (const s of supplements) {
    const fp = fingerprint(s);
    const existing = byFp.get(fp);
    if (!existing) {
      merged.push(s);
      byFp.set(fp, s);
      continue;
    }
    // 既存売りに実現損益が無い／0 のままなら明細の受渡損益で上書き
    if (
      s.side === "sell" &&
      typeof s.realizedPnlYen === "number" &&
      (existing.realizedPnlYen == null || existing.realizedPnlYen === 0)
    ) {
      const patched: StockBrokerOrderRecord = {
        ...existing,
        realizedPnlYen: s.realizedPnlYen,
        priceYen: existing.priceYen ?? s.priceYen,
        costPriceYen: existing.costPriceYen ?? s.costPriceYen,
        message: [existing.message, s.message].filter(Boolean).join("; "),
      };
      const idx = merged.findIndex((o) => o.id === existing.id);
      if (idx >= 0) merged[idx] = patched;
      byFp.set(fp, patched);
    }
  }

  return merged.sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

/** オラクル: 10/20 売り3件の受渡実現合計（−180 −1900 −410 = −2490） */
export function oct20StatementRealizedPnlYen(): number {
  const priced = assignStatementRealizedPnl(
    STOCK_BROKER_STATEMENT_FILLS.filter((f) => f.jstAt.startsWith("2026-10-20")),
  );
  return priced
    .filter((f) => f.side === "sell")
    .reduce((s, f) => s + (f.realizedPnlYen ?? 0), 0);
}
