import { randomUUID } from "crypto";
import {
  estimateTokenCostUsd,
  getAzureOpenAiDeployment,
} from "@/lib/server/azure-openai";
import { COSMOS_CONTAINERS, getContainer, isCosmosConfigured } from "@/lib/server/cosmos";
import { getUserById } from "@/lib/server/users";
import { DEFAULT_MONTHLY_TOKEN_LIMIT } from "@/lib/types/user";
import type { RecordTokenUsageInput, TokenUsage } from "@/lib/types/token-usage";

function tokenUsageContainer() {
  return getContainer(COSMOS_CONTAINERS.tokenUsage);
}

function monthStartIso(): string {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  return start.toISOString();
}

export async function getMonthlyTokenUsage(userId: string): Promise<number> {
  if (!isCosmosConfigured()) return 0;

  try {
    const { resources } = await tokenUsageContainer()
      .items.query<number>({
        query:
          "SELECT VALUE SUM(c.totalTokens) FROM c WHERE c.userId = @userId AND c.createdAt >= @monthStart",
        parameters: [
          { name: "@userId", value: userId },
          { name: "@monthStart", value: monthStartIso() },
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
  const user = await getUserById(userId);
  const limit = user?.monthlyTokenLimit ?? DEFAULT_MONTHLY_TOKEN_LIMIT;
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

export function defaultStockAiModel(): string {
  return getAzureOpenAiDeployment();
}
