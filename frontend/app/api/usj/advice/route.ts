import { withApiAccessLog } from "@/lib/server/api-access";
import { buildUsjAdvice } from "@/lib/server/usj-analysis";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  return withApiAccessLog(request, async () => {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");
    if (date && !DATE_RE.test(date)) {
      return Response.json({ error: "Invalid date format (YYYY-MM-DD)" }, { status: 400 });
    }
    try {
      return Response.json(await buildUsjAdvice(date ?? undefined));
    } catch (error) {
      return Response.json(
        {
          error: error instanceof Error ? error.message : "アドバイスの取得に失敗しました",
        },
        { status: 502 },
      );
    }
  });
}
