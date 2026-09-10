import {
  ensureDailySystemBriefing,
  runFullSystemBriefingPipeline,
} from "@/lib/server/soluna-system-chat";
import {
  isSolunaSystemStorageConfigured,
  saveBriefing,
} from "@/lib/server/soluna-system-store";
import type { SolunaNewsBriefing } from "@/lib/types/soluna";
import { recordSecurityEvent } from "@/lib/server/security-event";

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
    await recordSecurityEvent({
      request,
      eventType: "automation_auth_denied",
      severity: "high",
      statusCode: 401,
      attackLabel: "Soluna定期処理への不正アクセス",
      reason: "有効な自動タスク秘密情報なし",
      mitigation: "専用Bearer秘密情報の照合で遮断",
    });
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isSolunaSystemStorageConfigured()) {
    return Response.json({ error: "Cosmos DB が未設定です。" }, { status: 503 });
  }

  let force = false;
  let step: "news" | "chat" | "full" | "ingest" | "jobs" | "ensure" | "status" = "full";
  let ingestBriefing: SolunaNewsBriefing | null = null;
  try {
    const body = (await request.json()) as {
      force?: boolean;
      step?: string;
      briefing?: SolunaNewsBriefing;
    };
    force = body.force === true;
    if (
      body.step === "news" ||
      body.step === "chat" ||
      body.step === "full" ||
      body.step === "ingest" ||
      body.step === "jobs" ||
      body.step === "ensure" ||
      body.step === "status"
    ) {
      step = body.step;
    }
    if (body.step === "ingest" && body.briefing) {
      ingestBriefing = body.briefing;
    }
  } catch {
    /* empty body ok */
  }

  if (step === "ingest") {
    if (
      !ingestBriefing?.id ||
      !Array.isArray(ingestBriefing.items) ||
      ingestBriefing.items.length === 0
    ) {
      return Response.json({ ok: false, step: "ingest", error: "Invalid briefing payload." }, { status: 400 });
    }
    await saveBriefing(ingestBriefing);
    return Response.json({
      ok: true,
      step: "ingest",
      briefingId: ingestBriefing.id,
      summary: ingestBriefing.summary,
    });
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

  if (step === "jobs") {
    const { runDailyAutonomousJobs } = await import("@/lib/server/soluna-jobs");
    const jobs = await runDailyAutonomousJobs({ force });
    return Response.json({
      ok: true,
      step: "jobs",
      notePublished: jobs.latestNote?.published ?? false,
      noteUrl: jobs.latestNote?.noteUrl ?? null,
      noteError: jobs.latestNote?.error ?? null,
      boincMinutes: jobs.latestBoinc?.minutes ?? 0,
      medalUnits: jobs.assets?.medalUnits ?? 0,
    });
  }

  if (step === "ensure") {
    const ensured = await ensureDailySystemBriefing({ force });
    const status = ensured.ok ? 200 : 422;
    return Response.json({ step: "ensure", ...ensured }, { status });
  }

  if (step === "status") {
    const { getDailyBriefingStatus, getBriefingById, getLatestBoincRun } = await import(
      "@/lib/server/soluna-system-store"
    );
    const { assertTodayLiveBriefing } = await import("@/lib/server/soluna-news");
    const status = await getDailyBriefingStatus();
    const [todayBriefing, latestBoinc] = await Promise.all([
      getBriefingById(status.todayBriefingId),
      getLatestBoincRun(),
    ]);
    const liveGate = assertTodayLiveBriefing(todayBriefing);
    const boincForToday =
      latestBoinc && latestBoinc.briefingId === status.todayBriefingId ? latestBoinc : null;
    // 討伐完了後でも、実績未着・失敗なら BOINC 再実行が必要（スキップ成功にしない）
    const boincNeedsRun = Boolean(
      boincForToday &&
        (boincForToday.status === "waiting-spec" ||
          boincForToday.status === "queued" ||
          boincForToday.status === "error" ||
          !boincForToday.result),
    );
    return Response.json({
      ok: true,
      step: "status",
      needsBriefing: !status.complete,
      ...status,
      liveNewsOk: liveGate.ok,
      liveNewsReason: liveGate.ok ? null : liveGate.reason,
      briefingSource: todayBriefing?.source ?? null,
      briefingSummary: todayBriefing?.summary?.slice(0, 160) ?? null,
      boincNeedsRun,
      boincStatus: boincForToday?.status ?? null,
      boincMinutes: boincForToday?.minutes ?? 0,
      boincBriefingId: boincForToday?.briefingId ?? null,
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
