/**
 * 証券アプリの約定明細から補完する LIVE 約定（Costs 実現損益用）。
 * bridge が realizedPnlYen を保存していなかった期間の不足分。
 * 実約定は公開リポジトリに置かず、SWA アプリ設定 STOCK_BROKER_STATEMENT_FILLS_JSON
 * （JSON 配列、または その base64）から読む。
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

function isStatementFill(value: unknown): value is StockBrokerStatementFill {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.jstAt === "string" &&
    typeof v.symbol === "string" &&
    typeof v.symbolName === "string" &&
    (v.side === "buy" || v.side === "sell") &&
    typeof v.priceYen === "number" &&
    typeof v.qty === "number" &&
    typeof v.settlementYen === "number"
  );
}

/** 環境変数の約定明細（JSON か base64 JSON）。未設定・不正なら空。 */
export function parseStatementFillsSetting(
  raw: string | undefined | null,
): StockBrokerStatementFill[] {
  const text = raw?.trim();
  if (!text) return [];
  const json = text.startsWith("[")
    ? text
    : Buffer.from(text, "base64").toString("utf8");
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStatementFill).sort((a, b) => a.jstAt.localeCompare(b.jstAt));
  } catch {
    console.warn("[stock-statement-fills] STOCK_BROKER_STATEMENT_FILLS_JSON を解析できません");
    return [];
  }
}

export function loadStatementFills(): StockBrokerStatementFill[] {
  return parseStatementFillsSetting(process.env.STOCK_BROKER_STATEMENT_FILLS_JSON);
}
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
  fills: StockBrokerStatementFill[] = loadStatementFills(),
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
  fills: StockBrokerStatementFill[] = loadStatementFills(),
): StockBrokerOrderRecord[] {
  const supplements = statementFillsToOrders(userId, fills);
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

/** 指定 JST 日の売り受渡実現合計 */
export function statementRealizedPnlYenForDay(
  fills: StockBrokerStatementFill[],
  jstDate: string,
): number {
  const priced = assignStatementRealizedPnl(
    fills.filter((f) => f.jstAt.startsWith(jstDate)),
  );
  return priced
    .filter((f) => f.side === "sell")
    .reduce((s, f) => s + (f.realizedPnlYen ?? 0), 0);
}
