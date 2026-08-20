/**
 * BOINC 実行結果を GHA から受け取り Cosmos DB に保存する。
 * POST /api/soluna/boinc-report
 * Authorization: Bearer ${SOLUNA_CRON_SECRET}
 */
import {
  getLatestBoincRun,
  getSystemSettlement,
  saveSystemBoincRun,
  saveSystemSettlement,
} from "@/lib/server/soluna-system-store";

function authorizeCron(request: Request): boolean {
  const secret = process.env.SOLUNA_CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization")?.trim();
  return header === `Bearer ${secret}`;
}

type BoincReportBody = {
  briefingId: string;
  creditGranted: number;
  tasksCompleted: number;
  projectName: string;
  projectUrl: string;
  runMinutesActual: number;
};

function asFiniteNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

export async function POST(request: Request) {
  if (!authorizeCron(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let raw: Record<string, unknown>;
  try {
    raw = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  const briefingId = typeof raw.briefingId === "string" ? raw.briefingId.trim() : "";
  if (!briefingId) {
    return Response.json({ error: "Invalid body: briefingId required" }, { status: 400 });
  }

  const body: BoincReportBody = {
    briefingId,
    creditGranted: asFiniteNumber(raw.creditGranted, 0),
    tasksCompleted: Math.max(0, Math.round(asFiniteNumber(raw.tasksCompleted, 0))),
    projectName:
      typeof raw.projectName === "string" && raw.projectName.trim()
        ? raw.projectName.trim()
        : "World Community Grid",
    projectUrl:
      typeof raw.projectUrl === "string" && raw.projectUrl.trim()
        ? raw.projectUrl.trim()
        : "https://www.worldcommunitygrid.org",
    runMinutesActual: Math.max(0, Math.round(asFiniteNumber(raw.runMinutesActual, 0))),
  };

  const existing = await getLatestBoincRun();
  if (!existing || existing.briefingId !== body.briefingId) {
    return Response.json(
      { error: `BOINC run for briefing ${body.briefingId} not found` },
      { status: 404 },
    );
  }

  const creditRounded = Math.round(body.creditGranted * 100) / 100;
  const updated = {
    ...existing,
    status: "done" as const,
    solComment: `${body.tasksCompleted} タスク完了！クレジット ${creditRounded} cobblestones。街の開拓パワーが実測で届いた！`,
    lunaComment: `実績: ${body.runMinutesActual} 分稼働、${body.tasksCompleted} タスク、${creditRounded} cobblestones。拠点の礎に残したわ。`,
    result: {
      creditGranted: creditRounded,
      tasksCompleted: body.tasksCompleted,
      projectName: body.projectName,
      projectUrl: body.projectUrl,
      finishedAt: new Date().toISOString(),
      runMinutesActual: body.runMinutesActual,
    },
  };

  await saveSystemBoincRun(updated);

  // 予定分数と実績の差分だけ累積を補正（二重加算しない）
  const settlement = await getSystemSettlement();
  if (settlement?.latestEvent?.briefingId === body.briefingId) {
    const planned = settlement.latestEvent.todayMinutes;
    const delta = body.runMinutesActual - planned;
    if (delta !== 0) {
      const patched = {
        ...settlement,
        cumulativeMinutes: Math.max(0, settlement.cumulativeMinutes + delta),
        latestEvent: {
          ...settlement.latestEvent,
          todayMinutes: body.runMinutesActual,
          cumulativeMinutes: Math.max(0, settlement.latestEvent.cumulativeMinutes + delta),
        },
        updatedAt: new Date().toISOString(),
      };
      await saveSystemSettlement(patched);
    }
  }

  return Response.json({
    ok: true,
    briefingId: body.briefingId,
    creditGranted: creditRounded,
    tasksCompleted: body.tasksCompleted,
  });
}
