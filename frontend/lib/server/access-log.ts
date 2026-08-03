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
  if (path.startsWith("/api/docs")) return "docs";
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
  if (path.endsWith("/council/ask")) return "ask";
  if (path.endsWith("/council/config")) return "config";
  if (path.endsWith("/docs/generate")) return "generate";
  if (path.endsWith("/space/apod/summary")) return "apod-summary";
  if (path.endsWith("/space/apod")) return "apod";
  if (path.endsWith("/space/neo")) return "neo";
  if (path.endsWith("/space/chat")) return "chat";
  if (path.endsWith("/costs/dashboard")) return "dashboard";
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
