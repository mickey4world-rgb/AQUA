import { withApiAccessLog } from "@/lib/server/api-access";
import { isCosmosConfigured } from "@/lib/server/cosmos";
import { analyzeStock } from "@/lib/server/stock-analysis";
import { enhanceStockAdviceWithAi } from "@/lib/server/stock-ai-advice";
import {
  deleteStockWatch,
  getStockWatch,
  updateStockWatch,
} from "@/lib/server/stock-watches";
import type { UpdateStockWatchRequest } from "@/lib/types/stock";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  if (!isCosmosConfigured()) {
    return Response.json({ error: "ServiceUnavailable" }, { status: 503 });
  }

  return withApiAccessLog(request, async (auth) => {
    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    const withAi = searchParams.get("ai") === "1";

    const watch = await getStockWatch(auth.userId, id);
    if (!watch) {
      return Response.json({ error: "NotFound" }, { status: 404 });
    }

    try {
      let advice = await analyzeStock(watch);
      if (withAi) {
        advice = await enhanceStockAdviceWithAi(watch, advice, auth.userId);
      }
      return Response.json({ ...watch, advice });
    } catch (error) {
      return Response.json({
        ...watch,
        adviceError: error instanceof Error ? error.message : "分析失敗",
      });
    }
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  if (!isCosmosConfigured()) {
    return Response.json({ error: "ServiceUnavailable" }, { status: 503 });
  }

  return withApiAccessLog(request, async (auth) => {
    const { id } = await context.params;
    const body = (await request.json()) as UpdateStockWatchRequest;
    const watch = await updateStockWatch(auth.userId, id, body);

    if (!watch) {
      return Response.json({ error: "NotFound" }, { status: 404 });
    }

    return Response.json(watch);
  });
}

export async function DELETE(request: Request, context: RouteContext) {
  if (!isCosmosConfigured()) {
    return Response.json({ error: "ServiceUnavailable" }, { status: 503 });
  }

  return withApiAccessLog(request, async (auth) => {
    const { id } = await context.params;
    const deleted = await deleteStockWatch(auth.userId, id);

    if (!deleted) {
      return Response.json({ error: "NotFound" }, { status: 404 });
    }

    return Response.json({ ok: true });
  });
}
