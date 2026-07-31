import { requireAuth } from "@/lib/server/auth";
import { isCosmosConfigured } from "@/lib/server/cosmos";
import { analyzeStock } from "@/lib/server/stock-analysis";
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

  const auth = requireAuth(request.headers.get("x-ms-client-principal"));
  if (auth instanceof Response) return auth;

  const { id } = await context.params;
  const watch = await getStockWatch(auth.userId, id);
  if (!watch) {
    return Response.json({ error: "NotFound" }, { status: 404 });
  }

  try {
    const advice = await analyzeStock(watch);
    return Response.json({ ...watch, advice });
  } catch (error) {
    return Response.json({
      ...watch,
      adviceError: error instanceof Error ? error.message : "分析失敗",
    });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  if (!isCosmosConfigured()) {
    return Response.json({ error: "ServiceUnavailable" }, { status: 503 });
  }

  const auth = requireAuth(request.headers.get("x-ms-client-principal"));
  if (auth instanceof Response) return auth;

  const { id } = await context.params;
  const body = (await request.json()) as UpdateStockWatchRequest;
  const watch = await updateStockWatch(auth.userId, id, body);

  if (!watch) {
    return Response.json({ error: "NotFound" }, { status: 404 });
  }

  return Response.json(watch);
}

export async function DELETE(request: Request, context: RouteContext) {
  if (!isCosmosConfigured()) {
    return Response.json({ error: "ServiceUnavailable" }, { status: 503 });
  }

  const auth = requireAuth(request.headers.get("x-ms-client-principal"));
  if (auth instanceof Response) return auth;

  const { id } = await context.params;
  const deleted = await deleteStockWatch(auth.userId, id);

  if (!deleted) {
    return Response.json({ error: "NotFound" }, { status: 404 });
  }

  return Response.json({ ok: true });
}
