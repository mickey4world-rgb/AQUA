import { SECURITY_ARCHITECTURE_LAYERS } from "@/lib/security-architecture";
import { buildAttackInsights } from "@/lib/security-attack-insights";
import {
  assessWorldSecurityIssues,
  buildWorldFeedMeta,
  defaultWorldIssueContext,
  worldIssuesSummaryLabel,
} from "@/lib/security-world-issues";
import { listActiveAutoBlocks } from "@/lib/server/security-blocklist";
import { listSecurityEvents } from "@/lib/server/security-event";
import {
  getLatestSecurityTriage,
  getRecentSecurityTriageLevels,
} from "@/lib/server/security-triage";
import type { SecurityAnalyticsReport } from "@/lib/types/analytics";
import type { SecurityEventType } from "@/lib/types/security-event";

const EVENT_LABELS: Record<SecurityEventType, string> = {
  auth_denied: "認証・許可リストで遮断",
  automation_auth_denied: "自動タスク認証で遮断",
  rate_limited: "レート制限で遮断",
  invalid_request: "不正入力を遮断",
  auto_blocked: "繰り返し攻撃を自動ブロック",
};

function monthLabelJa(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return month;
  return `${match[1]}年${Number(match[2])}月`;
}

function mapTriage(
  triage: NonNullable<Awaited<ReturnType<typeof getLatestSecurityTriage>>>,
): NonNullable<SecurityAnalyticsReport["latestTriage"]> {
  return {
    dateJst: triage.dateJst,
    generatedAt: triage.generatedAt,
    ageHours: Math.max(
      0,
      Math.floor((Date.now() - Date.parse(triage.generatedAt)) / 3_600_000),
    ),
    level: triage.level,
    headline: triage.headline,
    summary: triage.summary,
    reasons: triage.reasons,
    actions: triage.actions,
    aiStatus: triage.aiStatus,
    aiModel: triage.aiModel,
    aiReason: triage.aiReason,
    counts: triage.counts,
    issues: triage.issues,
    collections: triage.collections.map((c) => ({
      source: c.source,
      ok: c.ok,
      count: c.count,
      error: c.error ?? null,
      optional: Boolean(c.optional),
      checkedAt: c.checkedAt ?? null,
      alternative: c.alternative ?? null,
    })),
    events: triage.events,
    openSecurityPrs: Array.isArray(triage.openSecurityPrs) ? triage.openSecurityPrs : [],
    appliedAutoPatches: Array.isArray(triage.appliedAutoPatches)
      ? triage.appliedAutoPatches
      : [],
    modelSelection: triage.modelSelection ?? null,
    worldIssues: Array.isArray(triage.worldIssues) ? triage.worldIssues : undefined,
    worldFeedMeta: triage.worldFeedMeta,
  };
}

export async function buildSecurityAnalyticsReport(
  month: string,
): Promise<SecurityAnalyticsReport> {
  const [events, triage, blocks, triageHistory] = await Promise.all([
    listSecurityEvents(month),
    getLatestSecurityTriage(),
    listActiveAutoBlocks(),
    getRecentSecurityTriageLevels(90),
  ]);
  const sourceSet = new Set<string>();
  const pathSet = new Set<string>();
  const byTypeMap = new Map<
    SecurityEventType,
    { count: number; mitigation: string }
  >();
  const byCountryMap = new Map<string, number>();
  const byDayMap = new Map<string, number>();
  let highSeverityEvents = 0;

  for (const event of events) {
    sourceSet.add(event.sourceHash);
    pathSet.add(event.path);
    if (event.severity === "high") highSeverityEvents += 1;

    const type = byTypeMap.get(event.eventType) ?? {
      count: 0,
      mitigation: event.mitigation,
    };
    type.count += 1;
    byTypeMap.set(event.eventType, type);

    const country = event.country || "不明";
    byCountryMap.set(country, (byCountryMap.get(country) ?? 0) + 1);

    const date = event.createdAt.slice(0, 10);
    byDayMap.set(date, (byDayMap.get(date) ?? 0) + 1);
  }

  const attackInsights = buildAttackInsights(
    events.map((e) => ({
      country: e.country,
      path: e.path,
      reason: e.attackLabel || e.mitigation,
      count: 1,
    })),
    { topN: 80 },
  );

  const recentPatches = (triage?.appliedAutoPatches?.length ?? 0) > 0;
  const savedWorld =
    triage && Array.isArray(triage.worldIssues) && triage.worldIssues.length > 0
      ? triage.worldIssues
      : null;
  const worldIssues =
    savedWorld ??
    assessWorldSecurityIssues(
      defaultWorldIssueContext({ recentDependencyPatches: recentPatches }),
    );
  const worldFeedMeta =
    savedWorld && triage?.worldFeedMeta
      ? triage.worldFeedMeta
      : buildWorldFeedMeta(null, worldIssues);

  return {
    month,
    monthLabel: monthLabelJa(month),
    summary: {
      blockedEvents: events.length,
      highSeverityEvents,
      uniqueSources: sourceSet.size,
      affectedPaths: pathSet.size,
    },
    architectureLayers: SECURITY_ARCHITECTURE_LAYERS.map((layer) => ({
      id: layer.id,
      title: layer.title,
      role: layer.role,
      defenses: [...layer.defenses],
    })),
    worldIssues,
    worldIssuesSummary: worldIssuesSummaryLabel(worldIssues),
    worldFeedMeta,
    attackInsights,
    byType: [...byTypeMap.entries()]
      .map(([eventType, value]) => ({
        eventType,
        label: EVENT_LABELS[eventType],
        count: value.count,
        mitigation: value.mitigation,
      }))
      .sort((a, b) => b.count - a.count),
    byCountry: [...byCountryMap.entries()]
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count),
    byDay: [...byDayMap.entries()]
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    recentEvents: events.slice(0, 100).map((event) => ({
      id: event.id,
      eventType: event.eventType,
      severity: event.severity,
      attackLabel: event.attackLabel,
      path: event.path,
      method: event.method,
      statusCode: event.statusCode,
      sourceHash: event.sourceHash,
      country: event.country || "不明",
      region: event.region || "不明",
      mitigation: event.mitigation,
      createdAt: event.createdAt,
    })),
    coverageNote:
      "表示値はAQUAアプリ層で検知・遮断してSecurityEventsへ記録できた事象です。Azure基盤がアプリ到達前に遮断したDDoS・プラットフォーム認証拒否は含みません。攻撃イベントは月単位、診断は日単位で過去を選べます。",
    latestTriage: triage ? mapTriage(triage) : null,
    triageHistory,
    activeAutoBlocks:
      blocks?.map((b) => ({
        blockedUntil: b.blockedUntil,
        lastBlockedAt: b.lastBlockedAt,
        blockCount: b.blockCount,
        lastAttackLabel: b.lastAttackLabel,
        lastPath: b.lastPath,
        country: b.country,
      })) ?? null,
  };
}

/** 過去日付の診断を画面用に整形（履歴閲覧 API） */
export function mapSecurityTriageForClient(
  triage: NonNullable<Awaited<ReturnType<typeof getLatestSecurityTriage>>>,
): NonNullable<SecurityAnalyticsReport["latestTriage"]> {
  return mapTriage(triage);
}
