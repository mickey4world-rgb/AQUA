import { getJstToday } from "@/lib/disney-holidays";
import { withApiAccessLog } from "@/lib/server/api-access";
import { buildMarioEveningAdvice } from "@/lib/server/usj-character-advice";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  return withApiAccessLog(request, async () => {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");
    if (date && !DATE_RE.test(date)) {
      return Response.json({ error: "Invalid date format (YYYY-MM-DD)" }, { status: 400 });
    }
    const target = date ?? getJstToday();
    return Response.json(buildMarioEveningAdvice(target, "preview"));
  });
}
