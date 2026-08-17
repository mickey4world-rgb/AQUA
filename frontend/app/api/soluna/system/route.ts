import { withApiAccessLog } from "@/lib/server/api-access";
import { buildSystemState } from "@/lib/server/soluna-system-chat";
import { isSolunaSystemStorageConfigured } from "@/lib/server/soluna-system-store";

export async function GET(request: Request) {
  return withApiAccessLog(request, async () => {
    if (!isSolunaSystemStorageConfigured()) {
      return Response.json(
        { error: "Cosmos DB が未設定のためシステム会話を読み込めません。" },
        { status: 503 },
      );
    }

    const state = await buildSystemState();
    return Response.json(state);
  });
}
