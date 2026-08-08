import { AzureOpenAI } from "openai";

/** domestic = 日本リージョンにデータを留める用途（AI 合議・国内限定） */
export type AzureOpenAiResidency = "domestic" | "global";

const JAPAN_AZURE_REGIONS = new Set(["japaneast", "japanwest"]);

const clientCache = new Map<string, AzureOpenAI>();

export function isAzureOpenAiConfigured(): boolean {
  return Boolean(
    process.env.AZURE_OPENAI_ENDPOINT &&
      process.env.AZURE_OPENAI_API_KEY &&
      process.env.AZURE_OPENAI_DEPLOYMENT,
  );
}

export function getAzureOpenAiDeployment(): string {
  return process.env.AZURE_OPENAI_DEPLOYMENT ?? "stock-advice";
}

export function getAzureOpenAiRegion(): string | undefined {
  return process.env.AZURE_OPENAI_REGION?.trim().toLowerCase();
}

export function getDomesticAzureEndpoint(): string {
  const endpoint =
    process.env.AZURE_OPENAI_ENDPOINT_DOMESTIC ?? process.env.AZURE_OPENAI_ENDPOINT;
  if (!endpoint) {
    throw new Error("Azure OpenAI endpoint is not configured");
  }
  return endpoint;
}

export function getGlobalAzureEndpoint(): string {
  const endpoint =
    process.env.AZURE_OPENAI_ENDPOINT_GLOBAL ?? process.env.AZURE_OPENAI_ENDPOINT;
  if (!endpoint) {
    throw new Error("Azure OpenAI endpoint is not configured");
  }
  return endpoint;
}

export function assertJapanResidency(residency: AzureOpenAiResidency): void {
  if (residency !== "domestic") return;

  const region = getAzureOpenAiRegion();
  if (region && !JAPAN_AZURE_REGIONS.has(region)) {
    throw new Error(
      `国内限定モードは日本リージョン（Japan East / Japan West）の Azure OpenAI のみ使用できます。` +
        ` AZURE_OPENAI_REGION=${region} は許可されていません。`,
    );
  }
}

export function isDomesticJapanResidencyConfigured(): boolean {
  if (!isAzureOpenAiConfigured()) return false;
  try {
    assertJapanResidency("domestic");
    return Boolean(getDomesticAzureEndpoint());
  } catch {
    return false;
  }
}

export function getDomesticDataRegionLabel(): string {
  const region = getAzureOpenAiRegion();
  if (region === "japaneast") return "Japan East — Azure OpenAI（データ国内保持）";
  if (region === "japanwest") return "Japan West — Azure OpenAI（データ国内保持）";
  return "Japan — Azure OpenAI（データ国内保持）";
}

export function getAzureOpenAiClient(
  deployment?: string,
  residency: AzureOpenAiResidency = "global",
): AzureOpenAI {
  if (!isAzureOpenAiConfigured()) {
    throw new Error("Azure OpenAI is not configured");
  }

  assertJapanResidency(residency);

  const dep = deployment ?? getAzureOpenAiDeployment();
  const endpoint =
    residency === "domestic" ? getDomesticAzureEndpoint() : getGlobalAzureEndpoint();
  const cacheKey = `${residency}:${endpoint}:${dep}`;
  let cached = clientCache.get(cacheKey);
  if (!cached) {
    cached = new AzureOpenAI({
      endpoint,
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      apiVersion: process.env.AZURE_OPENAI_API_VERSION ?? "2024-10-21",
      deployment: dep,
    });
    clientCache.set(cacheKey, cached);
  }

  return cached;
}

export function estimateTokenCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  // Gemini は Google AI Studio の無料枠のみ利用するため課金なし
  if (model.toLowerCase().includes("gemini")) return 0;

  const rates: Record<string, { input: number; output: number }> = {
    "gpt-4o-mini": { input: 0.15 / 1_000_000, output: 0.6 / 1_000_000 },
    "gpt-4o": { input: 2.5 / 1_000_000, output: 10 / 1_000_000 },
    "gpt-5.4-mini": { input: 0.25 / 1_000_000, output: 2 / 1_000_000 },
  };

  const normalized = Object.entries(rates).find(([name]) =>
    model.includes(name),
  )?.[1];
  const rate = normalized ?? rates["gpt-4o"];
  return promptTokens * rate.input + completionTokens * rate.output;
}
