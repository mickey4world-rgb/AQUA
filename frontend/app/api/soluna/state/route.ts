import { withApiAccessLog } from "@/lib/server/api-access";
import {
  getOrCreateProfile,
  getShortcutToken,
  isSolunaStorageConfigured,
  listMemories,
  listMessages,
  rotateShortcutToken,
} from "@/lib/server/soluna-store";
import { getSolunaProvidersStatus } from "@/lib/server/soluna-chat";
import { resolveGrowthTier } from "@/lib/server/soluna-router";
import { resolveGrowthStage } from "@/lib/soluna-utils";
import type { SolunaStateResponse } from "@/lib/types/soluna";

async function buildState(userId: string): Promise<SolunaStateResponse> {
  const profile = await getOrCreateProfile(userId);
  const [solMemories, lunaMemories, messages, shortcutToken] = await Promise.all([
    listMemories(userId, "sol"),
    listMemories(userId, "luna"),
    listMessages(userId),
    getShortcutToken(userId),
  ]);

  const providers = await getSolunaProvidersStatus(userId);

  return {
    profile,
    sol: {
      character: "sol",
      name: "Sol",
      nameJa: "ソル",
      symbol: "☀",
      intimacy: profile.solIntimacy,
      interactions: profile.solInteractions,
      stage: resolveGrowthStage("sol", profile.solIntimacy),
      model: providers.sol.model,
      provider: providers.sol.provider,
      growthTier: resolveGrowthTier(profile.solIntimacy),
      tierLevel: providers.sol.tierLevel,
      routeReason: providers.sol.modelLabel ?? (providers.autoRouting ? "質問と親密度で自動選択" : undefined),
      memories: solMemories,
    },
    luna: {
      character: "luna",
      name: "Luna",
      nameJa: "ルーナ",
      symbol: "🌙",
      intimacy: profile.lunaIntimacy,
      interactions: profile.lunaInteractions,
      stage: resolveGrowthStage("luna", profile.lunaIntimacy),
      model: providers.luna.model,
      provider: providers.luna.provider,
      growthTier: resolveGrowthTier(profile.lunaIntimacy),
      tierLevel: providers.luna.tierLevel,
      routeReason: providers.luna.modelLabel ?? (providers.autoRouting ? "質問と親密度で自動選択" : undefined),
      memories: lunaMemories,
    },
    messages,
    shortcutToken,
    configured: isSolunaStorageConfigured(),
    costMode: providers.costMode,
    costReason: providers.costMode !== "normal" ? providers.costReason : undefined,
  };
}

export async function GET(request: Request) {
  return withApiAccessLog(request, async (auth) => {
    if (!isSolunaStorageConfigured()) {
      return Response.json(
        { error: "Cosmos DB が未設定のため Soluna の記憶を保存できません。" },
        { status: 503 },
      );
    }

    const state = await buildState(auth.userId);
    return Response.json(state);
  });
}

export async function POST(request: Request) {
  return withApiAccessLog(request, async (auth) => {
    if (!isSolunaStorageConfigured()) {
      return Response.json({ error: "Cosmos DB が未設定です。" }, { status: 503 });
    }

    let body: { action?: string } = {};
    try {
      body = (await request.json()) as { action?: string };
    } catch {
      /* optional body */
    }

    if (body.action === "rotate-token") {
      const token = await rotateShortcutToken(auth.userId);
      return Response.json({ shortcutToken: token });
    }

    const state = await buildState(auth.userId);
    return Response.json(state);
  });
}
