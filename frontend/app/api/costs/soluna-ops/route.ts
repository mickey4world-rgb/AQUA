import { withApiAccessLog } from "@/lib/server/api-access";
import { getSolunaOpsAnalyticsReport } from "@/lib/server/soluna-ops-analytics";
import { isSolunaSystemStorageConfigured } from "@/lib/server/soluna-system-store";

function parseMonth(raw: string | null): string {
  if (raw && /^\d{4}-\d{2}$/.test(raw)) return raw;
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export async function GET(request: Request) {
  return withApiAccessLog(
    request,
    async () => {
      if (!isSolunaSystemStorageConfigured()) {
        return Response.json(
          { error: "Cosmos DB が未設定のため Soluna 運用分析を読み込めません。" },
          { status: 503 },
        );
      }

      const month = parseMonth(new URL(request.url).searchParams.get("month"));
      try {
        const report = await getSolunaOpsAnalyticsReport(month);
        return Response.json(report, {
          headers: {
            // ブラウザが Note/BOINC 更新を長く隠さない（サーバー側 fresh TTL は 20 分）
            "Cache-Control": "private, max-age=60, stale-while-revalidate=300",
            "X-Costs-Source": "soluna-ops-cache",
          },
        });
      } catch (error) {
        console.error("[api/costs/soluna-ops]", error);
        return Response.json(
          {
            error:
              error instanceof Error
                ? `Soluna 運用分析の取得に失敗しました: ${error.message}`
                : "Soluna 運用分析の取得に失敗しました。",
          },
          { status: 500 },
        );
      }
    },
    { skipAccessLog: true },
  );
}
