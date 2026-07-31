import { withApiAccessLog } from "@/lib/server/api-access";
import { isCosmosConfigured } from "@/lib/server/cosmos";
import { analyzeStock } from "@/lib/server/stock-analysis";
import {
  createStockWatch,
  listStockWatches,
} from "@/lib/server/stock-watches";
import type { CreateStockWatchRequest } from "@/lib/types/stock";

export async function GET(request: Request) {
  if (!isCosmosConfigured()) {
    return Response.json({ error: "ServiceUnavailable" }, { status: 503 });
  }

  return withApiAccessLog(request, async (auth) => {
    const watches = await listStockWatches(auth.userId);
    const withAdvice = await Promise.all(
      watches
        .filter((w) => w.isActive)
        .map(async (watch) => {
          try {
            const advice = await analyzeStock(watch);
            return { ...watch, advice };
          } catch {
            return watch;
          }
        }),
    );

    const inactive = watches.filter((w) => !w.isActive);
    return Response.json([...withAdvice, ...inactive]);
  });
}

export async function POST(request: Request) {
  if (!isCosmosConfigured()) {
    return Response.json({ error: "ServiceUnavailable" }, { status: 503 });
  }

  return withApiAccessLog(request, async (auth) => {
    const body = (await request.json()) as CreateStockWatchRequest;

    if (!body.ticker?.trim()) {
      return Response.json({ error: "ticker is required" }, { status: 400 });
    }
    if (typeof body.buyPrice !== "number" || body.buyPrice <= 0) {
      return Response.json({ error: "buyPrice must be positive" }, { status: 400 });
    }

    const watch = await createStockWatch(auth.userId, body);

    try {
      const advice = await analyzeStock(watch);
      return Response.json({ ...watch, advice }, { status: 201 });
    } catch {
      return Response.json(watch, { status: 201 });
    }
  });
}
