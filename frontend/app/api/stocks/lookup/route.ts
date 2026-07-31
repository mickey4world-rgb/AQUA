import { withApiAccessLog } from "@/lib/server/api-access";
import { resolveStockName } from "@/lib/server/stock-market";
import { normalizeTicker } from "@/lib/stock-utils";
import type { StockMarket } from "@/lib/types/stock";

export async function GET(request: Request) {
  return withApiAccessLog(request, async () => {
    const { searchParams } = new URL(request.url);
    const rawTicker = searchParams.get("ticker")?.trim();
    const market = (searchParams.get("market") ?? "us") as StockMarket;

    if (!rawTicker) {
      return Response.json({ error: "ticker is required" }, { status: 400 });
    }

    const ticker = normalizeTicker(rawTicker, market);
    const name = await resolveStockName(ticker, market).catch(() => null);
    return Response.json({ ticker, market, name });
  });
}
