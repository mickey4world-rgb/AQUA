import { randomUUID } from "crypto";
import {
  estimateTokenCostUsd,
  getAzureOpenAiDeployment,
} from "@/lib/server/azure-openai";
import { COSMOS_CONTAINERS, getContainer, isCosmosConfigured } from "@/lib/server/cosmos";
import { ensureUserTokenLimit, effectiveTokenLimit } from "@/lib/server/users";
import type { RecordTokenUsageInput, TokenUsage } from "@/lib/types/token-usage";

function tokenUsageContainer() {
  return getContainer(COSMOS_CONTAINERS.tokenUsage);
}

export function monthStartIso(date = new Date()): string {
  const start = new Date(date);
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  return start.toISOString();
}

export function monthEndIso(date = new Date()): string {
  const end = new Date(date);
  end.setUTCMonth(end.getUTCMonth() + 1, 1);
  end.setUTCHours(0, 0, 0, 0);
  return end.toISOString();
}

export function parseMonthParam(month?: string | null): Date {
  if (!month) return new Date();
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return new Date();
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
}

export async function getMonthlyTokenUsage(
  userId: string,
  monthDate = new Date(),
): Promise<number> {
  if (!isCosmosConfigured()) return 0;

  try {
    const { resources } = await tokenUsageContainer()
      .items.query<number>({
        query:
          "SELECT VALUE SUM(c.totalTokens) FROM c WHERE c.userId = @userId AND c.createdAt >= @monthStart AND c.createdAt < @monthEnd",
        parameters: [
          { name: "@userId", value: userId },
          { name: "@monthStart", value: monthStartIso(monthDate) },
          { name: "@monthEnd", value: monthEndIso(monthDate) },
        ],
      })
      .fetchAll();

    return resources[0] ?? 0;
  } catch {
    return 0;
  }
}

export async function getMonthlyTokenCostUsd(
  userId: string,
  monthDate = new Date(),
): Promise<number> {
  if (!isCosmosConfigured()) return 0;

  try {
    const { resources } = await tokenUsageContainer()
      .items.query<number>({
        query:
          "SELECT VALUE SUM(c.estimatedCostUsd) FROM c WHERE c.userId = @userId AND c.createdAt >= @monthStart AND c.createdAt < @monthEnd",
        parameters: [
          { name: "@userId", value: userId },
          { name: "@monthStart", value: monthStartIso(monthDate) },
          { name: "@monthEnd", value: monthEndIso(monthDate) },
        ],
      })
      .fetchAll();

    return resources[0] ?? 0;
  } catch {
    return 0;
  }
}

export async function canUseAiTokens(userId: string): Promise<{
  allowed: boolean;
  used: number;
  limit: number;
}> {
  const user = await ensureUserTokenLimit(userId);
  const limit = effectiveTokenLimit(user);
  const used = await getMonthlyTokenUsage(userId);

  return {
    allowed: used < limit,
    used,
    limit,
  };
}

export async function recordTokenUsage(
  input: RecordTokenUsageInput,
): Promise<TokenUsage | null> {
  if (!isCosmosConfigured()) return null;

  const totalTokens = input.promptTokens + input.completionTokens;
  const record: TokenUsage = {
    id: randomUUID(),
    userId: input.userId,
    feature: input.feature,
    model: input.model,
    promptTokens: input.promptTokens,
    completionTokens: input.completionTokens,
    totalTokens,
    estimatedCostUsd: estimateTokenCostUsd(
      input.model,
      input.promptTokens,
      input.completionTokens,
    ),
    requestId: input.requestId,
    createdAt: new Date().toISOString(),
  };

  try {
    const { resource } = await tokenUsageContainer().items.create(record);
    return resource ?? record;
  } catch {
    return null;
  }
}

export async function listRecentTokenUsage(
  userId: string,
  monthStart: string,
  monthEnd: string,
  limit = 50,
): Promise<TokenUsage[]> {
  if (!isCosmosConfigured()) return [];

  try {
    const { resources } = await tokenUsageContainer()
      .items.query<TokenUsage>({
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

export async function getTokenStatsByFeature(
  userId: string,
  monthStart: string,
  monthEnd: string,
): Promise<
  Array<{
    feature: string;
    requests: number;
    totalTokens: number;
    promptTokens: number;
    completionTokens: number;
    estimatedCostUsd: number;
  }>
> {
  if (!isCosmosConfigured()) return [];

  try {
    const { resources } = await tokenUsageContainer()
      .items.query<{
        feature: string;
        requests: number;
        totalTokens: number;
        promptTokens: number;
        completionTokens: number;
        estimatedCostUsd: number;
      }>({
        query: `
          SELECT c.feature,
                 COUNT(1) AS requests,
                 SUM(c.totalTokens) AS totalTokens,
                 SUM(c.promptTokens) AS promptTokens,
                 SUM(c.completionTokens) AS completionTokens,
                 SUM(c.estimatedCostUsd) AS estimatedCostUsd
          FROM c
          WHERE c.userId = @userId
            AND c.createdAt >= @monthStart
            AND c.createdAt < @monthEnd
          GROUP BY c.feature
        `,
        parameters: [
          { name: "@userId", value: userId },
          { name: "@monthStart", value: monthStart },
          { name: "@monthEnd", value: monthEnd },
        ],
      })
      .fetchAll();

    return resources.map((row) => ({
      feature: row.feature,
      requests: row.requests ?? 0,
      totalTokens: row.totalTokens ?? 0,
      promptTokens: row.promptTokens ?? 0,
      completionTokens: row.completionTokens ?? 0,
      estimatedCostUsd: row.estimatedCostUsd ?? 0,
    }));
  } catch {
    return [];
  }
}

export async function getDailyTokenUsage(
  userId: string,
  monthStart: string,
  monthEnd: string,
): Promise<Array<{ date: string; totalTokens: number; estimatedCostUsd: number }>> {
  if (!isCosmosConfigured()) return [];

  try {
    const { resources } = await tokenUsageContainer()
      .items.query<{ date: string; totalTokens: number; estimatedCostUsd: number }>({
        query: `
          SELECT SUBSTRING(c.createdAt, 0, 10) AS date,
                 SUM(c.totalTokens) AS totalTokens,
                 SUM(c.estimatedCostUsd) AS estimatedCostUsd
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

    return resources.map((row) => ({
      date: row.date,
      totalTokens: row.totalTokens ?? 0,
      estimatedCostUsd: row.estimatedCostUsd ?? 0,
    }));
  } catch {
    return [];
  }
}

export function defaultStockAiModel(): string {
  return getAzureOpenAiDeployment();
}
