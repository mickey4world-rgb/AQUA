import { withApiAccessLog } from "@/lib/server/api-access";
import { summarizeApodInJapanese } from "@/lib/server/space-apod-summary";
import type { ApodEntry } from "@/lib/types/space";

type SummaryBody = {
  apod?: ApodEntry;
};

export async function POST(request: Request) {
  return withApiAccessLog(request, async (auth) => {
    let body: SummaryBody;
    try {
      body = (await request.json()) as SummaryBody;
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (!body.apod?.title || !body.apod.explanation) {
      return Response.json({ error: "画像データが不足しています。" }, { status: 400 });
    }

    const result = await summarizeApodInJapanese(auth.userId, body.apod);
    if (!result.ok) {
      return Response.json({ error: result.reason }, { status: 422 });
    }

    return Response.json({
      titleJa: result.titleJa,
      explanationJa: result.explanationJa,
      model: result.model,
    });
  });
}
