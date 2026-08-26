import { withApiAccessLog } from "@/lib/server/api-access";
import {
  deleteSolunaImage,
  isSolunaImageStoreConfigured,
} from "@/lib/server/soluna-images";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, context: RouteContext) {
  return withApiAccessLog(request, async (auth) => {
    if (!isSolunaImageStoreConfigured()) {
      return Response.json(
        { error: "Cosmos DB が未設定のため画像スタジオを利用できません。" },
        { status: 503 },
      );
    }
    const { id } = await context.params;
    if (!id) {
      return Response.json({ error: "id が必要です" }, { status: 400 });
    }
    try {
      await deleteSolunaImage(auth.userId, id);
      return Response.json({ ok: true });
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : "削除に失敗しました" },
        { status: 422 },
      );
    }
  });
}
