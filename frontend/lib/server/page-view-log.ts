import { createHash, randomUUID } from "crypto";
import { publicPageLabel } from "@/lib/public-pages";
import { COSMOS_CONTAINERS, getContainer, isCosmosConfigured } from "@/lib/server/cosmos";
import type { PageViewLog, RecordPageViewInput } from "@/lib/types/page-view-log";

function pageViewContainer() {
  return getContainer(COSMOS_CONTAINERS.pageViewLogs);
}

export function maskVisitorKey(visitorKey: string): string {
  const hash = createHash("sha256").update(visitorKey).digest("hex");
  return `anon-${hash.slice(0, 8)}`;
}

export async function recordPageView(input: RecordPageViewInput): Promise<void> {
  if (!isCosmosConfigured()) return;

  const record: PageViewLog = {
    id: randomUUID(),
    pathname: input.pathname,
    pageLabel: publicPageLabel(input.pathname),
    visitorKey: input.visitorKey.slice(0, 128),
    referrer: input.referrer?.slice(0, 512) ?? null,
    userAgent: input.userAgent?.slice(0, 256) ?? null,
    createdAt: new Date().toISOString(),
  };

  try {
    await pageViewContainer().items.create(record);
  } catch {
    // Logging must not break page loads.
  }
}

export async function getPageViewStatsByPath(
  monthStart: string,
  monthEnd: string,
): Promise<Array<{ pathname: string; pageLabel: string; pageViews: number }>> {
  if (!isCosmosConfigured()) return [];

  try {
    const { resources } = await pageViewContainer()
      .items.query<{ pathname: string; pageLabel: string; pageViews: number }>({
        query: `
          SELECT c.pathname, c.pageLabel, COUNT(1) AS pageViews
          FROM c
          WHERE c.createdAt >= @monthStart AND c.createdAt < @monthEnd
          GROUP BY c.pathname, c.pageLabel
        `,
        parameters: [
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

export async function getPageViewVisitorRows(
  monthStart: string,
  monthEnd: string,
): Promise<Array<{ pathname: string; visitorKey: string; hits: number }>> {
  if (!isCosmosConfigured()) return [];

  try {
    const { resources } = await pageViewContainer()
      .items.query<{ pathname: string; visitorKey: string; hits: number }>({
        query: `
          SELECT c.pathname, c.visitorKey, COUNT(1) AS hits
          FROM c
          WHERE c.createdAt >= @monthStart AND c.createdAt < @monthEnd
          GROUP BY c.pathname, c.visitorKey
        `,
        parameters: [
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

export async function getDailyPageViewCounts(
  monthStart: string,
  monthEnd: string,
): Promise<Array<{ date: string; pageViews: number }>> {
  if (!isCosmosConfigured()) return [];

  try {
    const { resources } = await pageViewContainer()
      .items.query<{ date: string; pageViews: number }>({
        query: `
          SELECT SUBSTRING(c.createdAt, 0, 10) AS date, COUNT(1) AS pageViews
          FROM c
          WHERE c.createdAt >= @monthStart AND c.createdAt < @monthEnd
          GROUP BY SUBSTRING(c.createdAt, 0, 10)
        `,
        parameters: [
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

export async function getDailyPageViewVisitorKeys(
  monthStart: string,
  monthEnd: string,
): Promise<Array<{ date: string; visitorKey: string }>> {
  if (!isCosmosConfigured()) return [];

  try {
    const { resources } = await pageViewContainer()
      .items.query<{ date: string; visitorKey: string }>({
        query: `
          SELECT SUBSTRING(c.createdAt, 0, 10) AS date, c.visitorKey
          FROM c
          WHERE c.createdAt >= @monthStart AND c.createdAt < @monthEnd
        `,
        parameters: [
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

export async function getReferrerStats(
  monthStart: string,
  monthEnd: string,
): Promise<Array<{ referrer: string | null; count: number }>> {
  if (!isCosmosConfigured()) return [];

  try {
    const { resources } = await pageViewContainer()
      .items.query<{ referrer: string | null; count: number }>({
        query: `
          SELECT c.referrer, COUNT(1) AS count
          FROM c
          WHERE c.createdAt >= @monthStart AND c.createdAt < @monthEnd
          GROUP BY c.referrer
        `,
        parameters: [
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

export async function listRecentPageViews(
  monthStart: string,
  monthEnd: string,
  limit = 80,
): Promise<PageViewLog[]> {
  if (!isCosmosConfigured()) return [];

  try {
    const { resources } = await pageViewContainer()
      .items.query<PageViewLog>({
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
