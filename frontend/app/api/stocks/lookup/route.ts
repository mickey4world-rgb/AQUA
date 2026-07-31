import { requireAuth } from "@/lib/server/auth";
import { resolveStockName } from "@/lib/server/stock-market";
import { normalizeTicker } from "@/lib/stock-utils";
import type { StockMarket } from "@/lib/types/stock";

export async function GET(request: Request) {
  const auth = requireAuth(request.headers.get("x-ms-client-principal"));
  if (auth instanceof Response) return auth;

  const { searchParams } = new URL(request.url);
  const rawTicker = searchParams.get("ticker")?.trim();
  const market = (searchParams.get("market") ?? "us") as StockMarket;

  if (!rawTicker) {
    return Response.json({ error: "ticker is required" }, { status: 400 });
  }

  const ticker = normalizeTicker(rawTicker, market);
  const name = await resolveStockName(ticker, market).catch(() => null);
  return Response.json({ ticker, market, name });
}
