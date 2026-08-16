/**
 * Soluna 知能ティア別の推奨モデル（Azure デプロイ名 / Foundry デプロイ名）
 */

export type SolunaModelTier = "budding" | "growing" | "mature";

/** Azure OpenAI — 例: GPT-5 系は `council-gpt5` 等のカスタムデプロイ名 */
export const SOLUNA_OPENAI_DEPLOYMENT_DEFAULTS: Record<SolunaModelTier, string> = {
  budding: "gpt-4o-mini",
  growing: "council-gpt5",
  mature: "council-gpt5",
};

/**
 * Azure AI Foundry Claude — デフォルトの model パラメータ（デプロイ名）
 * @see https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/claude-models
 */
export const SOLUNA_CLAUDE_DEPLOYMENT_DEFAULTS: Record<SolunaModelTier, string> = {
  budding: "claude-haiku-4-5",
  growing: "claude-sonnet-5",
  mature: "claude-opus-5",
};

/** 知能 Lv.3 で Fable を使う場合（一般向け・要 Foundry でデプロイ） */
export const SOLUNA_CLAUDE_FABLE_DEPLOYMENT = "claude-fable-5";

/** Mythos は Glasswing 等の限定アクセス — 通常 Soluna では未使用 */
export const SOLUNA_CLAUDE_MYTHOS_DEPLOYMENT = "claude-mythos-5";

export const SOLUNA_GEMINI_MODEL_DEFAULTS: Record<SolunaModelTier, string> = {
  budding: "gemini-flash-latest",
  growing: "gemini-flash-latest",
  mature: "gemini-flash-latest",
};

/** UI / ドキュメント用 — 利用可能な最新モデル一覧 */
export const SOLUNA_LATEST_MODEL_CATALOG = {
  openai: {
    label: "Azure OpenAI",
    examples: ["GPT-5.5 / GPT-5 系（デプロイ名: council-gpt5 等）", "gpt-4o-mini（軽量）"],
    env: {
      fast: "SOLUNA_OPENAI_DEPLOYMENT_FAST",
      standard: "SOLUNA_OPENAI_DEPLOYMENT / SOLUNA_LUNA_DEPLOYMENT",
      advanced: "SOLUNA_OPENAI_DEPLOYMENT_ADVANCED",
    },
  },
  claude: {
    label: "Azure AI Foundry Claude",
    examples: [
      "claude-haiku-4-5（Lv.1）",
      "claude-sonnet-5 / claude-sonnet-4-6（Lv.2）",
      "claude-opus-5（Lv.3）",
      "claude-fable-5（Lv.3 代替・一般向け）",
      "claude-mythos-5（限定・サイバー研究向け）",
    ],
    env: {
      fast: "SOLUNA_CLAUDE_DEPLOYMENT_FAST",
      standard: "SOLUNA_CLAUDE_DEPLOYMENT",
      advanced: "SOLUNA_CLAUDE_DEPLOYMENT_ADVANCED",
      fable: "SOLUNA_CLAUDE_DEPLOYMENT_FABLE",
    },
  },
  gemini: {
    label: "Gemini",
    examples: ["gemini-flash-latest"],
    env: {
      fast: "SOLUNA_GEMINI_MODEL_FAST",
      standard: "SOLUNA_GEMINI_MODEL / SOLUNA_SOL_MODEL",
      advanced: "SOLUNA_GEMINI_MODEL_ADVANCED",
    },
  },
} as const;
