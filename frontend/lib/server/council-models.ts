import {
  getAzureOpenAiDeployment,
  getDomesticDataRegionLabel,
  isAzureOpenAiConfigured,
  isDomesticJapanResidencyConfigured,
} from "@/lib/server/azure-openai";
import { councilDepthConfig } from "@/lib/server/council-config";
import { getGeminiModel, isGeminiConfigured } from "@/lib/server/gemini";
import type { CouncilDepth, CouncilMode, CouncilModelMeta } from "@/lib/types/council";

export type CouncilModelConfig = CouncilModelMeta & {
  role: "logic" | "creative" | "skeptic" | "explorer";
  persona: string;
  maxTokens: number;
  featureSuffix: string;
  /** Azure の最新系推論デプロイ（カスタム名でも length 空応答になりやすい） */
  reasoningHeavy?: boolean;
};

const PERSONAS = {
  logic: "論理派。事実とリスクを短く整理。",
  creative: "発想派。代替案を1つ提案。",
  skeptic: "懐疑派。弱点と反論を1点指摘。",
  explorer: "探査派 Gemini。別角度の観点や見落とされがちな選択肢を1つ足す。",
  judge: "議長。意見を統合し実用的な結論を出す。",
} as const;

function deploymentOrDefault(envKey: string, fallback?: string): string {
  return process.env[envKey] ?? fallback ?? getAzureOpenAiDeployment();
}

/** 国内限定 — GLOBAL 系へのフォールバック禁止。日本リージョン専用デプロイのみ */
function domesticDeployment(envKey: string): string {
  return (
    process.env[envKey] ??
    process.env.AZURE_OPENAI_DEPLOYMENT_DOMESTIC ??
    getAzureOpenAiDeployment()
  );
}

export function formatModelDisplay(
  meta: Pick<CouncilModelMeta, "provider" | "model" | "deployment">,
): string {
  if (meta.provider === "openai") {
    return `OpenAI · ${meta.model ?? "—"}`;
  }
  if (meta.provider === "gemini") {
    return `Gemini · ${meta.model ?? "—"}`;
  }
  return `Azure · ${meta.deployment ?? meta.model ?? "—"}`;
}

function withDisplay(model: CouncilModelConfig | CouncilModelMeta): CouncilModelMeta {
  const displayName = formatModelDisplay(model);
  return {
    id: model.id,
    label: model.label,
    provider: model.provider,
    deployment: model.deployment,
    model: model.model,
    displayName,
    role: "role" in model ? model.role : undefined,
  };
}

export function getGeminiDebater(): CouncilModelConfig {
  return {
    id: "gemini-explorer",
    role: "explorer",
    label: "探査派 Gemini",
    provider: "gemini",
    model: getGeminiModel(),
    persona: PERSONAS.explorer,
    maxTokens: 420,
    featureSuffix: "gemini",
  };
}

/** 国内限定 — 日本リージョン Azure OpenAI、議論者 A/B/C を個別デプロイ */
export function getDomesticDebaters(): CouncilModelConfig[] {
  return [
    {
      id: "logic",
      role: "logic",
      label: "論理派アナリスト",
      provider: "azure",
      deployment: domesticDeployment("AZURE_OPENAI_DEPLOYMENT_DEBATE_A"),
      persona: PERSONAS.logic,
      maxTokens: 420,
      featureSuffix: "logic",
    },
    {
      id: "creative",
      role: "creative",
      label: "発想派プランナー",
      provider: "azure",
      deployment: domesticDeployment("AZURE_OPENAI_DEPLOYMENT_DEBATE_B"),
      persona: PERSONAS.creative,
      maxTokens: 420,
      featureSuffix: "creative",
    },
    {
      id: "skeptic",
      role: "skeptic",
      label: "懐疑派レビュアー",
      provider: "azure",
      deployment: domesticDeployment("AZURE_OPENAI_DEPLOYMENT_DEBATE_C"),
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
      reasoningHeavy: true,
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
      reasoningHeavy: true,
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
      reasoningHeavy: true,
    },
  ];
}

export function getCouncilDebaters(
  mode: CouncilMode,
  depth: CouncilDepth = "compact",
): CouncilModelConfig[] {
  const all = mode === "domestic" ? getDomesticDebaters() : getGlobalDebaters();
  const { debaterIds } = councilDepthConfig(depth);

  const list = debaterIds
    .map((role) => all.find((m) => m.role === role))
    .filter((m): m is CouncilModelConfig => Boolean(m));

  // Gemini は Google 経由のため国内限定には入れず、国内問わずの合議に参加させる。
  if (mode === "global" && isGeminiConfigured()) {
    list.push(getGeminiDebater());
  }

  return list;
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
      reasoningHeavy: true,
    };
  }

  const judgeDep = domesticDeployment("AZURE_OPENAI_DEPLOYMENT_DEBATE_JUDGE");

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
  const geminiConfigured = isGeminiConfigured();
  const domesticResidencyOk = isDomesticJapanResidencyConfigured();
  const domesticDebaters = getDomesticDebaters().map(withDisplay);
  const domesticJudge = withDisplay(getCouncilJudge("domestic"));
  const globalDebaters = [
    ...getGlobalDebaters(),
    ...(geminiConfigured ? [getGeminiDebater()] : []),
  ].map(withDisplay);
  const globalJudge = withDisplay(getCouncilJudge("global"));

  return {
    azureConfigured,
    geminiConfigured,
    setupHint: azureConfigured
      ? undefined
      : "Azure OpenAI（AZURE_OPENAI_ENDPOINT 等）が未設定です。SWA の環境変数を確認してください。",
    domestic: {
      available: azureConfigured && domesticResidencyOk,
      label: "国内限定",
      description:
        "プロンプト・添付データは日本リージョン（Japan East / West）の Azure OpenAI のみで処理します。OpenAI 直 API や海外リージョンは使用しません。",
      models: domesticDebaters,
      judge: domesticJudge,
      dataRegion: getDomesticDataRegionLabel(),
      warning:
        azureConfigured && !domesticResidencyOk
          ? "AZURE_OPENAI_REGION が日本以外に設定されています。国内限定を使うには japaneast または japanwest を指定してください。"
          : undefined,
    },
    global: {
      available: azureConfigured,
      label: "国内問わず（最新）",
      description: geminiConfigured
        ? "Azure OpenAI の最新系デプロイに加え、Gemini が探査派として合議に参加します。"
        : "Azure OpenAI の最新系デプロイを使用。OpenAI 直契約は不要です。GEMINI_API_KEY / 中継があれば Gemini も参加できます。",
      models: globalDebaters,
      judge: globalJudge,
      dataRegion: geminiConfigured
        ? "Azure OpenAI — Latest tier + Gemini"
        : "Azure OpenAI — Latest tier",
      warning: azureConfigured
        ? "国内限定より新しいモデルデプロイを優先します。Azure ポータルで GLOBAL 系デプロイ名を設定してください。"
        : undefined,
    },
  };
}
