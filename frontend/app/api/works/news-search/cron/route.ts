import { buildWorksNewsDigest } from "@/lib/server/works-news-search";
import { saveWorksNewsDigest } from "@/lib/server/works-news-search-store";
import { isCosmosConfigured } from "@/lib/server/cosmos";
import { recordSecurityEvent } from "@/lib/server/security-event";
import type { NewsSearchDigest } from "@/lib/types/works-news-search";

export const maxDuration = 120;

function authorizeCron(request: Request): boolean {
  const secret =
    process.env.SOLUNA_CRON_SECRET?.trim() || process.env.WORKS_CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization")?.trim();
  if (header === `Bearer ${secret}`) return true;
  const alt = request.headers.get("x-works-cron-secret")?.trim();
  return alt === secret;
}

function isValidDigest(value: unknown): value is NewsSearchDigest {
  if (!value || typeof value !== "object") return false;
  const doc = value as NewsSearchDigest;
  return (
    typeof doc.id === "string" &&
    typeof doc.fetchedAt === "string" &&
    !!doc.categories &&
    Array.isArray(doc.categories.ai)
  );
}

export async function POST(request: Request) {
  if (!authorizeCron(request)) {
    await recordSecurityEvent({
      request,
      eventType: "automation_auth_denied",
      severity: "high",
      statusCode: 401,
      attackLabel: "WORKSニュースサーチ定期処理への不正アクセス",
      reason: "有効な自動タスク秘密情報なし",
      mitigation: "専用Bearer秘密情報の照合で遮断",
    });
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isCosmosConfigured()) {
    return Response.json({ error: "Cosmos DB が未設定です。" }, { status: 503 });
  }

  let force = false;
  let ingest: NewsSearchDigest | null = null;
  try {
    const body = (await request.json()) as {
      force?: boolean;
      step?: string;
      digest?: NewsSearchDigest;
    };
    force = body.force === true;
    if (body.step === "ingest" && isValidDigest(body.digest)) {
      ingest = body.digest;
    }
  } catch {
    /* empty ok */
  }

  if (ingest) {
    await saveWorksNewsDigest(ingest);
    return Response.json({
      ok: true,
      step: "ingest",
      digestId: ingest.id,
      source: ingest.source,
      summary: ingest.summary,
      counts: {
        ai: ingest.categories.ai.length,
        systems: ingest.categories.systems.length,
        economy: ingest.categories.economy.length,
        government: ingest.categories.government.length,
      },
    });
  }

  const result = await buildWorksNewsDigest({ force });
  if (!result.ok) {
    return Response.json({ ok: false, error: result.reason }, { status: 422 });
  }

  return Response.json({
    ok: true,
    step: "build",
    digestId: result.digest.id,
    source: result.digest.source,
    counts: {
      ai: result.digest.categories.ai.length,
      systems: result.digest.categories.systems.length,
      economy: result.digest.categories.economy.length,
      government: result.digest.categories.government.length,
    },
    summary: result.digest.summary,
  });
}
