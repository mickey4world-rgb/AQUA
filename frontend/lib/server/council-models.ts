import {
  getAzureOpenAiDeployment,
  isAzureOpenAiConfigured,
} from "@/lib/server/azure-openai";
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

function deploymentOrDefault(envKey: string, fallback?: string): string {
  return process.env[envKey] ?? fallback ?? getAzureOpenAiDeployment();
}

export function formatModelDisplay(
  meta: Pick<CouncilModelMeta, "provider" | "model" | "deployment">,
): string {
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

/** 国内限定 — 日本リージョン Azure OpenAI、議論者 A/B/C を個別デプロイ */
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

/** 国内問わず — Azure OpenAI 最新系デプロイ（OpenAI 直 API 不要） */
export function getGlobalDebaters(): CouncilModelConfig[] {
  const latestDep = deploymentOrDefault("AZURE_OPENAI_DEPLOYMENT_GLOBAL", getAzureOpenAiDeployment());

  return [
    {
      id: "global-a",
      role: "logic",
      label: "最新 Analyst",
      provider: "azure",
      deployment: deploymentOrDefault("AZURE_OPENAI_DEPLOYMENT_GLOBAL_A", latestDep),
      persona: PERSONAS.logic,
      maxTokens: 480,
      featureSuffix: "global-a",
    },
    {
      id: "global-b",
      role: "creative",
      label: "最新 Planner",
      provider: "azure",
      deployment: deploymentOrDefault(
        "AZURE_OPENAI_DEPLOYMENT_GLOBAL_B",
        deploymentOrDefault("AZURE_OPENAI_DEPLOYMENT_DEBATE_B", latestDep),
      ),
      persona: PERSONAS.creative,
      maxTokens: 480,
      featureSuffix: "global-b",
    },
    {
      id: "global-c",
      role: "skeptic",
      label: "最新 Reviewer",
      provider: "azure",
      deployment: deploymentOrDefault(
        "AZURE_OPENAI_DEPLOYMENT_GLOBAL_C",
        deploymentOrDefault("AZURE_OPENAI_DEPLOYMENT_DEBATE_C", latestDep),
      ),
      persona: PERSONAS.skeptic,
      maxTokens: 480,
      featureSuffix: "global-c",
    },
  ];
}

export function getCouncilDebaters(
  mode: CouncilMode,
  depth: CouncilDepth = "compact",
): CouncilModelConfig[] {
  const all = mode === "domestic" ? getDomesticDebaters() : getGlobalDebaters();
  const { debaterIds } = councilDepthConfig(depth);

  return debaterIds
    .map((role) => all.find((m) => m.role === role))
    .filter((m): m is CouncilModelConfig => Boolean(m));
}

export function getCouncilJudge(mode: CouncilMode): CouncilModelConfig {
  if (mode === "global") {
    const latestDep = deploymentOrDefault(
      "AZURE_OPENAI_DEPLOYMENT_GLOBAL",
      getAzureOpenAiDeployment(),
    );
    return {
      id: "judge-global",
      role: "logic",
      label: "合議議長（最新）",
      provider: "azure",
      deployment: deploymentOrDefault("AZURE_OPENAI_DEPLOYMENT_GLOBAL_JUDGE", latestDep),
      persona: PERSONAS.judge,
      maxTokens: 550,
      featureSuffix: "judge-global",
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
  const azureConfigured = isAzureOpenAiConfigured();
  const domesticDebaters = getDomesticDebaters().map(withDisplay);
  const domesticJudge = withDisplay(getCouncilJudge("domestic"));
  const globalDebaters = getGlobalDebaters().map(withDisplay);
  const globalJudge = withDisplay(getCouncilJudge("global"));

  return {
    azureConfigured,
    setupHint: azureConfigured
      ? undefined
      : "Azure OpenAI（AZURE_OPENAI_ENDPOINT 等）が未設定です。SWA の環境変数を確認してください。",
    domestic: {
      available: azureConfigured,
      label: "国内限定",
      description:
        "日本リージョンの Azure OpenAI。論理・発想・懐疑の複数 AI が別デプロイで議論します（標準モードは3 AI）。",
      models: domesticDebaters,
      judge: domesticJudge,
      dataRegion: "Japan — Azure OpenAI",
    },
    global: {
      available: azureConfigured,
      label: "国内問わず（最新）",
      description:
        "Azure OpenAI の最新系デプロイを使用。OpenAI 直契約は不要です。AZURE_OPENAI_DEPLOYMENT_GLOBAL_* で最新モデルを指定できます。",
      models: globalDebaters,
      judge: globalJudge,
      dataRegion: "Azure OpenAI — Latest tier",
      warning: azureConfigured
        ? "国内限定より新しいモデルデプロイを優先します。Azure ポータルで GLOBAL 系デプロイ名を設定してください。"
        : undefined,
    },
  };
}
