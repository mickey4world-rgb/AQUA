import { listSecurityEvents } from "@/lib/server/security-event";
import type {
  SecurityAnalyticsReport,
} from "@/lib/types/analytics";
import type { SecurityEventType } from "@/lib/types/security-event";

const EVENT_LABELS: Record<SecurityEventType, string> = {
  auth_denied: "認証・許可リストで遮断",
  automation_auth_denied: "自動タスク認証で遮断",
  rate_limited: "レート制限で遮断",
  invalid_request: "不正入力を遮断",
};

export async function buildSecurityAnalyticsReport(
  month: string,
): Promise<SecurityAnalyticsReport> {
  const events = await listSecurityEvents(month);
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

  return {
    summary: {
      blockedEvents: events.length,
      highSeverityEvents,
      uniqueSources: sourceSet.size,
      affectedPaths: pathSet.size,
    },
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
      "表示値はAQUAアプリ層で検知・遮断してSecurityEventsへ記録できた事象です。Azure基盤がアプリ到達前に遮断したDDoS・プラットフォーム認証拒否は含みません。",
  };
}
