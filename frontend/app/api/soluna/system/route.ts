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

    try {
      const state = await buildSystemState();
      return Response.json(state);
    } catch (error) {
      console.error("[api/soluna/system]", error);
      return Response.json(
        {
          error:
            error instanceof Error
              ? `討伐ログの読み込みに失敗しました: ${error.message}`
              : "討伐ログの読み込みに失敗しました。",
        },
        { status: 500 },
      );
    }
  });
}
