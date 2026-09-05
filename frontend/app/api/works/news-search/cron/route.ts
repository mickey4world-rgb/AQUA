import {
  buildWorksNewsDigest,
  computeEnrichmentStatus,
  digestNeedsEnrichment,
  enrichWorksNewsDigestCategory,
  withEnrichmentMeta,
} from "@/lib/server/works-news-search";
import { saveWorksNewsDigest } from "@/lib/server/works-news-search-store";
import { isCosmosConfigured } from "@/lib/server/cosmos";
import { recordSecurityEvent } from "@/lib/server/security-event";
import {
  NEWS_SEARCH_CATEGORIES,
  type NewsSearchCategory,
  type NewsSearchDigest,
} from "@/lib/types/works-news-search";

export const maxDuration = 60;

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

function parseCategory(value: unknown): NewsSearchCategory | null {
  if (typeof value !== "string") return null;
  return (NEWS_SEARCH_CATEGORIES as readonly string[]).includes(value)
    ? (value as NewsSearchCategory)
    : null;
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
  let step = "build";
  let ingest: NewsSearchDigest | null = null;
  let category: NewsSearchCategory | null = null;
  try {
    const body = (await request.json()) as {
      force?: boolean;
      step?: string;
      digest?: NewsSearchDigest;
      category?: string;
    };
    force = body.force === true;
    if (typeof body.step === "string") step = body.step;
    if (body.step === "ingest" && isValidDigest(body.digest)) {
      ingest = body.digest;
    }
    category = parseCategory(body.category);
  } catch {
    /* empty ok */
  }

  if (ingest) {
    const digest = withEnrichmentMeta({
      ...ingest,
      source: "rss",
      enrichmentStatus: "pending",
    });
    await saveWorksNewsDigest(digest);
    return Response.json({
      ok: true,
      step: "ingest",
      digestId: digest.id,
      source: digest.source,
      enrichmentStatus: digest.enrichmentStatus,
      needsEnrichment: digestNeedsEnrichment(digest),
      summary: digest.summary,
      counts: {
        ai: digest.categories.ai.length,
        systems: digest.categories.systems.length,
        economy: digest.categories.economy.length,
        government: digest.categories.government.length,
      },
    });
  }

  if (step === "enrich") {
    if (!category) {
      return Response.json(
        { ok: false, error: "enrich には category が必要です。" },
        { status: 400 },
      );
    }
    const enriched = await enrichWorksNewsDigestCategory(category);
    if (!enriched.ok) {
      return Response.json(
        {
          ok: false,
          step: "enrich",
          category,
          error: enriched.reason,
          enrichmentOk: false,
        },
        { status: 422 },
      );
    }
    return Response.json({
      ok: true,
      step: "enrich",
      category,
      digestId: enriched.digest.id,
      enrichedCount: enriched.enrichedCount,
      enrichmentStatus: enriched.digest.enrichmentStatus,
      needsEnrichment: digestNeedsEnrichment(enriched.digest),
      enrichmentOk: enriched.digest.enrichmentStatus === "complete",
    });
  }

  if (step === "status") {
    const { getLatestWorksNewsDigest } = await import(
      "@/lib/server/works-news-search-store"
    );
    const latest = await getLatestWorksNewsDigest();
    if (!latest) {
      return Response.json({ ok: false, error: "digest missing" }, { status: 404 });
    }
    const meta = withEnrichmentMeta(latest);
    return Response.json({
      ok: true,
      step: "status",
      digestId: meta.id,
      enrichmentStatus: computeEnrichmentStatus(meta),
      needsEnrichment: digestNeedsEnrichment(meta),
      enrichmentOk: computeEnrichmentStatus(meta) === "complete",
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
    enrichmentStatus: result.digest.enrichmentStatus,
    needsEnrichment: digestNeedsEnrichment(result.digest),
    // RSS のみ成功。解説完了は enrichmentOk で別判定（ごまかさない）
    enrichmentOk: false,
    counts: {
      ai: result.digest.categories.ai.length,
      systems: result.digest.categories.systems.length,
      economy: result.digest.categories.economy.length,
      government: result.digest.categories.government.length,
    },
    summary: result.digest.summary,
  });
}
