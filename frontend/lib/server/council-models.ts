import { getAzureOpenAiDeployment, isAzureOpenAiConfigured } from "@/lib/server/azure-openai";
import { councilDepthConfig } from "@/lib/server/council-config";
import type { CouncilDepth, CouncilMode, CouncilModelMeta } from "@/lib/types/council";

export type CouncilModelConfig = CouncilModelMeta & {
  role: "logic" | "creative" | "skeptic";
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

const ROLE_INDEX = { logic: 0, creative: 1, skeptic: 2 } as const;

export function isOpenAiGlobalConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

function deploymentOrDefault(envKey: string, fallback?: string): string {
  return process.env[envKey] ?? fallback ?? getAzureOpenAiDeployment();
}

export function formatModelDisplay(meta: Pick<CouncilModelMeta, "provider" | "model" | "deployment">): string {
  if (meta.provider === "openai") {
    return `OpenAI · ${meta.model ?? "—"}`;
  }
  return `Azure · ${meta.deployment ?? meta.model ?? "—"}`;
}

function withDisplay(model: CouncilModelConfig): CouncilModelMeta {
  const displayName = formatModelDisplay(model);
  return {
    id: model.id,
    label: model.label,
    provider: model.provider,
    deployment: model.deployment,
    model: model.model,
    displayName,
  };
}

export function getDomesticDebaters(): CouncilModelConfig[] {
  const fallback = getAzureOpenAiDeployment();
  return [
    {
      id: "logic",
      role: "logic",
      label: "論理派アナリスト",
      provider: "azure",
      deployment: deploymentOrDefault("AZURE_OPENAI_DEPLOYMENT_DEBATE_A", fallback),
      persona: PERSONAS.logic,
      maxTokens: 420,
      featureSuffix: "logic",
    },
    {
      id: "creative",
      role: "creative",
      label: "発想派プランナー",
      provider: "azure",
      deployment: deploymentOrDefault("AZURE_OPENAI_DEPLOYMENT_DEBATE_B", fallback),
      persona: PERSONAS.creative,
      maxTokens: 420,
      featureSuffix: "creative",
    },
    {
      id: "skeptic",
      role: "skeptic",
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
  if (!isOpenAiGlobalConfigured()) {
    return [];
  }

  return [
    {
      id: "global-openai-a",
      role: "logic",
      label: "GPT Analyst",
      provider: "openai",
      model: process.env.OPENAI_MODEL_A ?? "gpt-5.6-sol",
      persona: PERSONAS.logic,
      maxTokens: 480,
      featureSuffix: "openai-a",
    },
    {
      id: "global-openai-b",
      role: "creative",
      label: "GPT Planner",
      provider: "openai",
      model: process.env.OPENAI_MODEL_B ?? "gpt-5.6-terra",
      persona: PERSONAS.creative,
      maxTokens: 480,
      featureSuffix: "openai-b",
    },
    {
      id: "global-openai-c",
      role: "skeptic",
      label: "GPT Reviewer",
      provider: "openai",
      model: process.env.OPENAI_MODEL_C ?? "gpt-5.6-luna",
      persona: PERSONAS.skeptic,
      maxTokens: 480,
      featureSuffix: "openai-c",
    },
  ];
}

export function getCouncilDebaters(
  mode: CouncilMode,
  depth: CouncilDepth = "compact",
): CouncilModelConfig[] {
  const all = mode === "domestic" ? getDomesticDebaters() : getGlobalDebaters();
  const { debaterIds } = councilDepthConfig(depth);

  if (mode === "domestic") {
    return debaterIds
      .map((role) => all.find((m) => m.role === role))
      .filter((m): m is CouncilModelConfig => Boolean(m));
  }

  return debaterIds
    .map((role) => all[ROLE_INDEX[role]])
    .filter((m): m is CouncilModelConfig => Boolean(m));
}

export function getCouncilJudge(mode: CouncilMode): CouncilModelConfig {
  if (mode === "global") {
    return {
      id: "judge-global",
      role: "logic",
      label: "GPT Judge",
      provider: "openai",
      model: process.env.OPENAI_MODEL_JUDGE ?? process.env.OPENAI_MODEL_A ?? "gpt-5.6-sol",
      persona: PERSONAS.judge,
      maxTokens: 550,
      featureSuffix: "judge",
    };
  }

  const judgeDep = deploymentOrDefault(
    "AZURE_OPENAI_DEPLOYMENT_DEBATE_JUDGE",
    getAzureOpenAiDeployment(),
  );

  return {
    id: "judge",
    role: "logic",
    label: "合議議長（国内）",
    provider: "azure",
    deployment: judgeDep,
    persona: PERSONAS.judge,
    maxTokens: 550,
    featureSuffix: "judge",
  };
}

export function getCouncilConfigMeta() {
  const domesticDebaters = getDomesticDebaters().map(withDisplay);
  const domesticJudge = withDisplay(getCouncilJudge("domestic"));
  const globalDebaters = getGlobalDebaters().map(withDisplay);
  const globalJudge = withDisplay(getCouncilJudge("global"));
  const openaiConfigured = isOpenAiGlobalConfigured();

  return {
    openaiConfigured,
    azureConfigured: isAzureOpenAiConfigured(),
    setupHint: openaiConfigured
      ? undefined
      : "Azure Portal → Static Web App (swa-personal-apps-prod) → Configuration → Application settings に OPENAI_API_KEY を追加してください。",
    domestic: {
      available: true,
      label: "国内限定",
      description: "Azure OpenAI（日本リージョン）のみ。データは国内に留まります。",
      models: domesticDebaters,
      judge: domesticJudge,
      dataRegion: "Japan — Azure OpenAI",
    },
    global: {
      available: openaiConfigured,
      label: "国内問わず（OpenAI）",
      description: openaiConfigured
        ? "OpenAI API の最新モデル（GPT-5.6 系）で合議します。データは海外に送信されます。"
        : "OPENAI_API_KEY 未設定のため利用できません。",
      models: globalDebaters,
      judge: globalJudge,
      dataRegion: "Global — OpenAI API",
      warning: openaiConfigured
        ? "質問・添付ファイルは OpenAI（海外）に送信されます。"
        : "Configuration に OPENAI_API_KEY を設定後、再読み込みしてください。",
    },
  };
}
