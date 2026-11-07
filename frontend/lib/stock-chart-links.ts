/**
 * 外部チャート（ローソク足）リンク。埋め込みより安定・規約安全。
 * 日本株は東証4桁コード前提。
 */
export type StockChartLink = {
  id: "kabutan" | "tradingview" | "yahoo-jp";
  label: string;
  href: string;
};

/** 7203 / 7203.T / TSE:7203 → 4桁 */
export function jpStockCode4(raw: string): string | null {
  const s = raw.trim().toUpperCase();
  const m =
    s.match(/^(\d{4})(?:\.T)?$/) ||
    s.match(/^TSE:(\d{4})$/) ||
    s.match(/^JPX:(\d{4})$/);
  return m?.[1] ?? null;
}

export function stockChartLinksForCode(codeOrTicker: string): StockChartLink[] {
  const code = jpStockCode4(codeOrTicker);
  if (!code) return [];
  return [
    {
      id: "kabutan",
      label: "株探",
      href: `https://kabutan.jp/stock/chart?code=${encodeURIComponent(code)}`,
    },
    {
      id: "tradingview",
      label: "TV",
      href: `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(`TSE:${code}`)}`,
    },
    {
      id: "yahoo-jp",
      label: "Y!ファイナンス",
      href: `https://finance.yahoo.co.jp/quote/${encodeURIComponent(`${code}.T`)}/chart`,
    },
  ];
}
