import {
  getAzureOpenAiCheapDeployment,
  getAzureOpenAiDeepDeployment,
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

const GLOBAL_DEPLOYMENT_ENV_KEYS = [
  "AZURE_OPENAI_DEPLOYMENT_GLOBAL",
  "AZURE_OPENAI_DEPLOYMENT_GLOBAL_A",
  "AZURE_OPENAI_DEPLOYMENT_GLOBAL_B",
  "AZURE_OPENAI_DEPLOYMENT_GLOBAL_C",
  "AZURE_OPENAI_DEPLOYMENT_GLOBAL_JUDGE",
  "AZURE_OPENAI_DEPLOYMENT_DEEP",
] as const;

/** GLOBAL 系を個別指定しているか（未設定なら既定デプロイへ自動フォールバック） */
export function isGlobalCouncilExplicitlyConfigured(): boolean {
  return GLOBAL_DEPLOYMENT_ENV_KEYS.some((key) => Boolean(process.env[key]?.trim()));
}

function globalDeploymentAutoNote(): string {
  const cheap = getAzureOpenAiCheapDeployment();
  const deep = getAzureOpenAiDeepDeployment();
  return (
    `簡潔／標準は安価デプロイ（${cheap}）、深掘りのみ GPT-5 系（${deep}）を使います。` +
    " 個別指定する場合は AZURE_OPENAI_DEPLOYMENT_GLOBAL_* / AZURE_OPENAI_DEPLOYMENT_DEEP を SWA に設定してください。"
  );
}

/** 国内限定 — GLOBAL 系へのフォールバック禁止。日本リージョン専用デプロイのみ */
function domesticDeployment(envKey: string): string {
  return (
    process.env[envKey] ??
    process.env.AZURE_OPENAI_DEPLOYMENT_DOMESTIC ??
    getAzureOpenAiDeployment()
  );
}

function globalTierDeployment(envKey: string, depth: CouncilDepth): string {
  const premium = councilDepthConfig(depth).usePremiumModels;
  if (premium) {
    return (
      process.env.AZURE_OPENAI_DEPLOYMENT_DEEP?.trim() ||
      process.env[envKey]?.trim() ||
      getAzureOpenAiDeepDeployment()
    );
  }
  // 簡潔／標準: FAST / GLOBAL が aqua-cheap ならそれを使う。未設定時も安価既定。
  return (
    process.env.AZURE_OPENAI_DEPLOYMENT_FAST?.trim() ||
    process.env[envKey]?.trim() ||
    getAzureOpenAiCheapDeployment()
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

/** 国内問わず — 簡潔/標準は安価、deep のみ GPT-5 系 */
export function getGlobalDebaters(depth: CouncilDepth = "compact"): CouncilModelConfig[] {
  const premium = councilDepthConfig(depth).usePremiumModels;

  return [
    {
      id: "global-a",
      role: "logic",
      label: premium ? "最新 Analyst" : "軽量 Analyst",
      provider: "azure",
      deployment: globalTierDeployment("AZURE_OPENAI_DEPLOYMENT_GLOBAL_A", depth),
      persona: PERSONAS.logic,
      maxTokens: 480,
      featureSuffix: "global-a",
      reasoningHeavy: premium,
    },
    {
      id: "global-b",
      role: "creative",
      label: premium ? "最新 Planner" : "軽量 Planner",
      provider: "azure",
      deployment: globalTierDeployment("AZURE_OPENAI_DEPLOYMENT_GLOBAL_B", depth),
      persona: PERSONAS.creative,
      maxTokens: 480,
      featureSuffix: "global-b",
      reasoningHeavy: premium,
    },
    {
      id: "global-c",
      role: "skeptic",
      label: premium ? "最新 Reviewer" : "軽量 Reviewer",
      provider: "azure",
      deployment: globalTierDeployment("AZURE_OPENAI_DEPLOYMENT_GLOBAL_C", depth),
      persona: PERSONAS.skeptic,
      maxTokens: 480,
      featureSuffix: "global-c",
      reasoningHeavy: premium,
    },
  ];
}

export function getCouncilDebaters(
  mode: CouncilMode,
  depth: CouncilDepth = "compact",
): CouncilModelConfig[] {
  const all = mode === "domestic" ? getDomesticDebaters() : getGlobalDebaters(depth);
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

export function getCouncilJudge(
  mode: CouncilMode,
  depth: CouncilDepth = "compact",
): CouncilModelConfig {
  if (mode === "global") {
    const premium = councilDepthConfig(depth).usePremiumModels;
    return {
      id: "judge-global",
      role: "logic",
      label: premium ? "合議議長（GPT-5）" : "合議議長（軽量）",
      provider: "azure",
      deployment: globalTierDeployment("AZURE_OPENAI_DEPLOYMENT_GLOBAL_JUDGE", depth),
      persona: PERSONAS.judge,
      maxTokens: 550,
      featureSuffix: "judge-global",
      reasoningHeavy: premium,
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
  const domesticJudge = withDisplay(getCouncilJudge("domestic", "compact"));
  const globalDebatersCheap = [
    ...getGlobalDebaters("compact"),
    ...(geminiConfigured ? [getGeminiDebater()] : []),
  ].map(withDisplay);
  const globalJudgeCheap = withDisplay(getCouncilJudge("global", "compact"));

  return {
    azureConfigured,
    geminiConfigured,
    setupHint: azureConfigured
      ? undefined
      : "Azure OpenAI（AZURE_OPENAI_ENDPOINT 等）が未設定です。SWA の環境変数を確認してください。",
    depths: {
      compact: councilDepthConfig("compact"),
      standard: councilDepthConfig("standard"),
      deep: councilDepthConfig("deep"),
    },
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
        ? `簡潔／標準は安価デプロイ（${getAzureOpenAiCheapDeployment()}）＋ Gemini。深掘りのみ GPT-5（${getAzureOpenAiDeepDeployment()}）。`
        : `簡潔／標準は安価デプロイ（${getAzureOpenAiCheapDeployment()}）。深掘りのみ GPT-5（${getAzureOpenAiDeepDeployment()}）。`,
      models: globalDebatersCheap,
      judge: globalJudgeCheap,
      dataRegion: geminiConfigured
        ? "Azure OpenAI — cheap / deep tier + Gemini"
        : "Azure OpenAI — cheap / deep tier",
      info:
        azureConfigured && !isGlobalCouncilExplicitlyConfigured()
          ? globalDeploymentAutoNote()
          : `深掘り時のみ ${getAzureOpenAiDeepDeployment()} を使用します。`,
    },
  };
}
