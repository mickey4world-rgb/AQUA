import { randomUUID } from "crypto";
import { COSMOS_CONTAINERS, getContainer, isCosmosConfigured } from "@/lib/server/cosmos";
import type {
  AccessLog,
  AppKey,
  RecordAccessLogInput,
} from "@/lib/types/access-log";

function accessLogContainer() {
  return getContainer(COSMOS_CONTAINERS.accessLogs);
}

function inferAppFromPath(path: string): AppKey {
  if (path.startsWith("/api/stocks")) return "stocks";
  if (path.startsWith("/api/disney")) return "disney";
  if (path.startsWith("/api/council")) return "council";
  if (path.startsWith("/api/soluna")) return "soluna";
  if (path.startsWith("/api/docs")) return "docs";
  if (path.startsWith("/api/works")) return "works";
  if (path.startsWith("/api/space")) return "space";
  if (path.startsWith("/api/costs")) return "costs";
  if (path.startsWith("/api/users")) return "users";
  return "system";
}

function inferFeatureFromPath(path: string, method: string): string {
  if (path.includes("/stocks/watches/") && path.split("/").length > 4) {
    return "watch-detail";
  }
  if (path.endsWith("/stocks/watches")) return "watches";
  if (path.endsWith("/stocks/lookup")) return "lookup";
  if (path.endsWith("/disney/chat")) return "chat";
  if (path.endsWith("/disney/advice")) return "advice";
  if (path.endsWith("/disney/waits")) return "waits";
  if (path.endsWith("/disney/status")) return "status";
  if (path.endsWith("/disney/calendar")) return "calendar";
  if (path.endsWith("/council/followup")) return "followup";
  if (path.endsWith("/council/ask/step")) return "ask-step";
  if (path.endsWith("/council/ask")) return "ask";
  if (path.endsWith("/council/config")) return "config";
  if (path.endsWith("/soluna/chat")) return "chat";
  if (path.endsWith("/soluna/state")) return "state";
  if (path.endsWith("/soluna/shortcut/chat")) return "shortcut-chat";
  if (path.endsWith("/docs/generate")) return "generate";
  if (path.endsWith("/works/consult")) return "consult";
  if (path.endsWith("/works/summarize")) return "summarize";
  if (path.includes("/works/notes")) return "notes";
  if (path.endsWith("/works/money-flow")) return "money-flow";
  if (path.endsWith("/works/judicial/case-chat")) return "case-chat";
  if (path.endsWith("/space/apod/summary")) return "apod-summary";
  if (path.endsWith("/space/apod")) return "apod";
  if (path.endsWith("/space/neo")) return "neo";
  if (path.includes("/space/neo/image")) return "neo-image";
  if (path.endsWith("/space/chat")) return "chat";
  if (path.endsWith("/costs/dashboard")) return "dashboard";
  if (path.endsWith("/costs/azure-infra")) return "azure-infra";
  if (path.endsWith("/costs/access-analytics")) return "access-analytics";
  if (path.endsWith("/costs/public-access-analytics")) return "public-access-analytics";
  if (path.endsWith("/analytics/pageview")) return "pageview";
  if (path.endsWith("/users/me")) return "profile";
  return `${method.toLowerCase()}-${path.split("/").pop() ?? "unknown"}`;
}

export async function recordAccessLog(input: RecordAccessLogInput): Promise<void> {
  if (!isCosmosConfigured()) return;

  const app = input.app ?? inferAppFromPath(input.path);
  const feature = input.feature ?? inferFeatureFromPath(input.path, input.method);

  const record: AccessLog = {
    id: randomUUID(),
    userId: input.userId,
    app,
    method: input.method,
    path: input.path,
    feature,
    statusCode: input.statusCode,
    durationMs: input.durationMs,
    createdAt: new Date().toISOString(),
  };

  try {
    await accessLogContainer().items.create(record);
  } catch {
    // Logging must not break API responses.
  }
}

export async function listRecentAccessLogs(
  userId: string,
  monthStart: string,
  monthEnd: string,
  limit = 50,
): Promise<AccessLog[]> {
  if (!isCosmosConfigured()) return [];

  try {
    const { resources } = await accessLogContainer()
      .items.query<AccessLog>({
        query:
          "SELECT * FROM c WHERE c.userId = @userId AND c.createdAt >= @monthStart AND c.createdAt < @monthEnd ORDER BY c.createdAt DESC OFFSET 0 LIMIT @limit",
        parameters: [
          { name: "@userId", value: userId },
          { name: "@monthStart", value: monthStart },
          { name: "@monthEnd", value: monthEnd },
          { name: "@limit", value: limit },
        ],
      })
      .fetchAll();

    return resources;
  } catch {
    return [];
  }
}

export async function getAccessStatsByApp(
  userId: string,
  monthStart: string,
  monthEnd: string,
): Promise<
  Array<{
    app: AppKey;
    apiCalls: number;
    avgDurationMs: number;
  }>
> {
  if (!isCosmosConfigured()) return [];

  try {
    const { resources } = await accessLogContainer()
      .items.query<{
        app: AppKey;
        apiCalls: number;
        avgDurationMs: number;
      }>({
        query: `
          SELECT c.app,
                 COUNT(1) AS apiCalls,
                 AVG(c.durationMs) AS avgDurationMs
          FROM c
          WHERE c.userId = @userId
            AND c.createdAt >= @monthStart
            AND c.createdAt < @monthEnd
          GROUP BY c.app
        `,
        parameters: [
          { name: "@userId", value: userId },
          { name: "@monthStart", value: monthStart },
          { name: "@monthEnd", value: monthEnd },
        ],
      })
      .fetchAll();

    return resources.map((row) => ({
      app: row.app,
      apiCalls: row.apiCalls ?? 0,
      avgDurationMs: Math.round(row.avgDurationMs ?? 0),
    }));
  } catch {
    return [];
  }
}

export type AccessUserFeatureRow = {
  userId: string;
  app: AppKey;
  feature: string;
  apiCalls: number;
  avgDurationMs: number;
  lastAccessAt: string;
};

/** 全ユーザーの user × app × feature 集計（アクセス分析用） */
export async function getAccessStatsByUserAndFeature(
  monthStart: string,
  monthEnd: string,
): Promise<AccessUserFeatureRow[]> {
  if (!isCosmosConfigured()) return [];

  try {
    const { resources } = await accessLogContainer()
      .items.query<AccessUserFeatureRow>({
        query: `
          SELECT c.userId, c.app, c.feature,
                 COUNT(1) AS apiCalls,
                 AVG(c.durationMs) AS avgDurationMs,
                 MAX(c.createdAt) AS lastAccessAt
          FROM c
          WHERE c.createdAt >= @monthStart AND c.createdAt < @monthEnd
          GROUP BY c.userId, c.app, c.feature
        `,
        parameters: [
          { name: "@monthStart", value: monthStart },
          { name: "@monthEnd", value: monthEnd },
        ],
      })
      .fetchAll();

    return resources.map((row) => ({
      userId: row.userId,
      app: row.app,
      feature: row.feature,
      apiCalls: row.apiCalls ?? 0,
      avgDurationMs: Math.round(row.avgDurationMs ?? 0),
      lastAccessAt: row.lastAccessAt,
    }));
  } catch {
    return [];
  }
}

export async function listRecentAccessLogsAllUsers(
  monthStart: string,
  monthEnd: string,
  limit = 100,
): Promise<AccessLog[]> {
  if (!isCosmosConfigured()) return [];

  try {
    const { resources } = await accessLogContainer()
      .items.query<AccessLog>({
        query:
          "SELECT * FROM c WHERE c.createdAt >= @monthStart AND c.createdAt < @monthEnd ORDER BY c.createdAt DESC OFFSET 0 LIMIT @limit",
        parameters: [
          { name: "@monthStart", value: monthStart },
          { name: "@monthEnd", value: monthEnd },
          { name: "@limit", value: limit },
        ],
      })
      .fetchAll();

    return resources;
  } catch {
    return [];
  }
}

export async function getDailyAccessCounts(
  userId: string,
  monthStart: string,
  monthEnd: string,
): Promise<Array<{ date: string; apiCalls: number }>> {
  if (!isCosmosConfigured()) return [];

  try {
    const { resources } = await accessLogContainer()
      .items.query<{ date: string; apiCalls: number }>({
        query: `
          SELECT SUBSTRING(c.createdAt, 0, 10) AS date, COUNT(1) AS apiCalls
          FROM c
          WHERE c.userId = @userId
            AND c.createdAt >= @monthStart
            AND c.createdAt < @monthEnd
          GROUP BY SUBSTRING(c.createdAt, 0, 10)
        `,
        parameters: [
          { name: "@userId", value: userId },
          { name: "@monthStart", value: monthStart },
          { name: "@monthEnd", value: monthEnd },
        ],
      })
      .fetchAll();

    return resources;
  } catch {
    return [];
  }
}

export async function listAccessLogsInRange(
  monthStart: string,
  monthEnd: string,
  limit = 8000,
): Promise<AccessLog[]> {
  if (!isCosmosConfigured()) return [];

  try {
    const { resources } = await accessLogContainer()
      .items.query<AccessLog>({
        query:
          "SELECT * FROM c WHERE c.createdAt >= @monthStart AND c.createdAt < @monthEnd ORDER BY c.createdAt DESC OFFSET 0 LIMIT @limit",
        parameters: [
          { name: "@monthStart", value: monthStart },
          { name: "@monthEnd", value: monthEnd },
          { name: "@limit", value: limit },
        ],
      })
      .fetchAll();
    return resources;
  } catch {
    return [];
  }
}

export function logApiAccess(
  request: Request,
  userId: string,
  statusCode: number,
  startedAt: number,
): void {
  const url = new URL(request.url);
  void recordAccessLog({
    userId,
    method: request.method,
    path: url.pathname,
    statusCode,
    durationMs: Date.now() - startedAt,
  });
}
