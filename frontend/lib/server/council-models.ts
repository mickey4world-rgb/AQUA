import { getAzureOpenAiDeployment } from "@/lib/server/azure-openai";
import { councilDepthConfig } from "@/lib/server/council-config";
import type { CouncilDepth, CouncilMode, CouncilModelMeta } from "@/lib/types/council";

export type CouncilModelConfig = CouncilModelMeta & {
  persona: string;
  maxTokens: number;
  featureSuffix: string;
};

const PERSONAS = {
  logic: "論理派。事実とリスクを短く整理。",
  creative: "発想派。代替案を1つ提案。",
  skeptic: "懐疑派。弱点と反論を1点指摘。",
  judge: "議長。意見を統合し実用的な結論を出す。",
} as const;

export function isOpenAiGlobalConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

function deploymentOrDefault(envKey: string, fallback?: string): string {
  return process.env[envKey] ?? fallback ?? getAzureOpenAiDeployment();
}

function toMeta(model: CouncilModelConfig): CouncilModelMeta {
  return {
    id: model.id,
    label: model.label,
    provider: model.provider,
    deployment: model.deployment,
    model: model.model,
  };
}

export function getDomesticDebaters(): CouncilModelConfig[] {
  const fallback = getAzureOpenAiDeployment();
  return [
    {
      id: "logic",
      label: "論理派アナリスト",
      provider: "azure",
      deployment: deploymentOrDefault("AZURE_OPENAI_DEPLOYMENT_DEBATE_A", fallback),
      persona: PERSONAS.logic,
      maxTokens: 420,
      featureSuffix: "logic",
    },
    {
      id: "creative",
      label: "発想派プランナー",
      provider: "azure",
      deployment: deploymentOrDefault("AZURE_OPENAI_DEPLOYMENT_DEBATE_B", fallback),
      persona: PERSONAS.creative,
      maxTokens: 420,
      featureSuffix: "creative",
    },
    {
      id: "skeptic",
      label: "懐疑派レビュアー",
      provider: "azure",
      deployment: deploymentOrDefault("AZURE_OPENAI_DEPLOYMENT_DEBATE_C", fallback),
      persona: PERSONAS.skeptic,
      maxTokens: 420,
      featureSuffix: "skeptic",
    },
  ];
}

export function getGlobalDebaters(): CouncilModelConfig[] {
  const models: CouncilModelConfig[] = [];

  if (isOpenAiGlobalConfigured()) {
    models.push(
      {
        id: "global-openai-a",
        label: "GPT Analyst (Global)",
        provider: "openai",
        model: process.env.OPENAI_MODEL_A ?? "gpt-4o",
        persona: PERSONAS.logic,
        maxTokens: 480,
        featureSuffix: "openai-a",
      },
      {
        id: "global-openai-b",
        label: "GPT Creative (Global)",
        provider: "openai",
        model: process.env.OPENAI_MODEL_B ?? "gpt-4o-mini",
        persona: PERSONAS.creative,
        maxTokens: 480,
        featureSuffix: "openai-b",
      },
      {
        id: "global-openai-c",
        label: "GPT Skeptic (Global)",
        provider: "openai",
        model: process.env.OPENAI_MODEL_C ?? "gpt-4o-mini",
        persona: PERSONAS.skeptic,
        maxTokens: 480,
        featureSuffix: "openai-c",
      },
    );
  }

  const globalDepA = process.env.AZURE_OPENAI_DEPLOYMENT_GLOBAL_A;
  const globalDepB = process.env.AZURE_OPENAI_DEPLOYMENT_GLOBAL_B;
  const globalDepC = process.env.AZURE_OPENAI_DEPLOYMENT_GLOBAL_C;

  if (globalDepA) {
    models.push({
      id: "global-azure-a",
      label: "Azure Global A",
      provider: "azure",
      deployment: globalDepA,
      persona: PERSONAS.logic,
      maxTokens: 480,
      featureSuffix: "azure-global-a",
    });
  }
  if (globalDepB) {
    models.push({
      id: "global-azure-b",
      label: "Azure Global B",
      provider: "azure",
      deployment: globalDepB,
      persona: PERSONAS.creative,
      maxTokens: 480,
      featureSuffix: "azure-global-b",
    });
  }
  if (globalDepC) {
    models.push({
      id: "global-azure-c",
      label: "Azure Global C",
      provider: "azure",
      deployment: globalDepC,
      persona: PERSONAS.skeptic,
      maxTokens: 480,
      featureSuffix: "azure-global-c",
    });
  }

  if (models.length >= 3) {
    return models.slice(0, 3);
  }

  const latestDep =
    process.env.AZURE_OPENAI_DEPLOYMENT_GLOBAL ?? getAzureOpenAiDeployment();
  return [
    {
      id: "global-latest-a",
      label: "Latest Analyst",
      provider: "azure",
      deployment: latestDep,
      persona: PERSONAS.logic,
      maxTokens: 480,
      featureSuffix: "latest-a",
    },
    {
      id: "global-latest-b",
      label: "Latest Planner",
      provider: "azure",
      deployment: deploymentOrDefault("AZURE_OPENAI_DEPLOYMENT_DEBATE_B", latestDep),
      persona: PERSONAS.creative,
      maxTokens: 480,
      featureSuffix: "latest-b",
    },
    {
      id: "global-latest-c",
      label: "Latest Reviewer",
      provider: "azure",
      deployment: deploymentOrDefault("AZURE_OPENAI_DEPLOYMENT_DEBATE_C", latestDep),
      persona: PERSONAS.skeptic,
      maxTokens: 480,
      featureSuffix: "skeptic",
    },
  ];
}

export function getCouncilDebaters(
  mode: CouncilMode,
  depth: CouncilDepth = "compact",
): CouncilModelConfig[] {
  const all = mode === "domestic" ? getDomesticDebaters() : getGlobalDebaters();
  const { debaterIds } = councilDepthConfig(depth);
  const idSet = new Set<string>(debaterIds);
  const filtered = all.filter((m) => idSet.has(m.id));
  return filtered.length > 0 ? filtered : all.slice(0, debaterIds.length);
}

export function getCouncilJudge(mode: CouncilMode): CouncilModelConfig {
  if (mode === "global" && isOpenAiGlobalConfigured()) {
    return {
      id: "judge-global",
      label: "GPT Judge (Global)",
      provider: "openai",
      model: process.env.OPENAI_MODEL_JUDGE ?? process.env.OPENAI_MODEL_A ?? "gpt-4o",
      persona: PERSONAS.judge,
      maxTokens: 550,
      featureSuffix: "judge",
    };
  }

  const judgeDep =
    mode === "global"
      ? deploymentOrDefault(
          "AZURE_OPENAI_DEPLOYMENT_GLOBAL_JUDGE",
          deploymentOrDefault(
            "AZURE_OPENAI_DEPLOYMENT_GLOBAL",
            deploymentOrDefault("AZURE_OPENAI_DEPLOYMENT_DEBATE_JUDGE", getAzureOpenAiDeployment()),
          ),
        )
      : deploymentOrDefault("AZURE_OPENAI_DEPLOYMENT_DEBATE_JUDGE", getAzureOpenAiDeployment());

  return {
    id: "judge",
    label: mode === "domestic" ? "合議議長（国内）" : "合議議長（最新）",
    provider: "azure",
    deployment: judgeDep,
    persona: PERSONAS.judge,
    maxTokens: 550,
    featureSuffix: "judge",
  };
}

export function getCouncilConfigMeta() {
  const domesticModels = getDomesticDebaters().map(toMeta);
  const globalModels = getGlobalDebaters().map(toMeta);
  const globalUsesExternal = isOpenAiGlobalConfigured();

  return {
    domestic: {
      available: true,
      label: "国内限定",
      description: "Azure OpenAI（日本リージョン）のみ。データは国内に留まります。",
      models: domesticModels,
      dataRegion: "Japan — Azure OpenAI",
    },
    global: {
      available: true,
      label: "国内問わず（最新）",
      description: globalUsesExternal
        ? "OpenAI API 等の最新モデルを含む。プロンプトが海外に送信される場合があります。"
        : "最新デプロイメント構成を使用。OPENAI_API_KEY 未設定時は Azure の最新系モデルで合議します。",
      models: globalModels,
      dataRegion: globalUsesExternal ? "Global (OpenAI API + Azure)" : "Azure OpenAI (latest tier)",
      warning: globalUsesExternal
        ? "このモードでは質問内容が日本国外の API に送信される可能性があります。"
        : "OPENAI_API_KEY を設定すると、より新しい海外モデルも参加できます。",
    },
  };
}
