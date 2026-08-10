import { withApiAccessLog } from "@/lib/server/api-access";

/** @deprecated クライアントは /api/council/ask/step を利用してください */
export async function POST(request: Request) {
  return withApiAccessLog(request, async () =>
    Response.json(
      {
        error:
          "AI 合議は段階実行 API に移行しました。アプリを再読み込みしてから再度お試しください。",
      },
      { status: 410 },
    ),
  );
}
