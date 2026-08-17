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
  try {
    const body = (await request.json()) as { force?: boolean };
    force = body.force === true;
  } catch {
    /* empty body ok */
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
