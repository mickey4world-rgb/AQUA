import { runFullSystemBriefingPipeline } from "@/lib/server/soluna-system-chat";
import { isSolunaSystemStorageConfigured } from "@/lib/server/soluna-system-store";

export const maxDuration = 120;

function authorizeCron(request: Request): boolean {
  const secret = process.env.SOLUNA_CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization")?.trim();
  if (header === `Bearer ${secret}`) return true;
  const alt = request.headers.get("x-soluna-cron-secret")?.trim();
  return alt === secret;
}

export async function POST(request: Request) {
  if (!authorizeCron(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isSolunaSystemStorageConfigured()) {
    return Response.json({ error: "Cosmos DB が未設定です。" }, { status: 503 });
  }

  let force = false;
  let step: "news" | "chat" | "full" = "full";
  try {
    const body = (await request.json()) as { force?: boolean; step?: string };
    force = body.force === true;
    if (body.step === "news" || body.step === "chat" || body.step === "full") {
      step = body.step;
    }
  } catch {
    /* empty body ok */
  }

  if (step === "news") {
    const personality = await import("@/lib/server/soluna-system-personality").then((m) =>
      m.getOrInitSystemPersonality({ rotateInterests: force }),
    );
    const { fetchGlobalNewsBriefing } = await import("@/lib/server/soluna-news");
    const news = await fetchGlobalNewsBriefing({
      force,
      interestKeywords: [...personality.sol.interests, ...personality.luna.interests],
    });
    if (!news.ok) {
      const status = news.reason.includes("すでに") ? 200 : 422;
      return Response.json({ ok: false, step: "news", error: news.reason }, { status });
    }
    return Response.json({
      ok: true,
      step: "news",
      briefingId: news.briefing.id,
      summary: news.briefing.summary,
    });
  }

  if (step === "chat") {
    const { runDailySystemChat } = await import("@/lib/server/soluna-system-chat");
    const chat = await runDailySystemChat({ force, skipFollowUp: true });
    if (!chat.ok) {
      const status = chat.skipped ? 200 : 422;
      return Response.json(
        { ok: false, step: "chat", skipped: chat.skipped ?? false, error: chat.reason },
        { status },
      );
    }
    return Response.json({
      ok: true,
      step: "chat",
      briefingId: chat.briefing.id,
      messageCount: chat.messages.length,
    });
  }

  const result = await runFullSystemBriefingPipeline({ force });
  if (!result.ok) {
    const status = result.skipped ? 200 : 422;
    return Response.json(
      { ok: false, skipped: result.skipped ?? false, error: result.reason },
      { status },
    );
  }

  return Response.json({
    ok: true,
    briefingId: result.briefing.id,
    messageCount: result.messages.length,
    summary: result.briefing.summary,
  });
}
