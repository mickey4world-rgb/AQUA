import { AzureOpenAI } from "openai";

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

export function getAzureOpenAiClient(deployment?: string): AzureOpenAI {
  if (!isAzureOpenAiConfigured()) {
    throw new Error("Azure OpenAI is not configured");
  }

  const dep = deployment ?? getAzureOpenAiDeployment();
  let cached = clientCache.get(dep);
  if (!cached) {
    cached = new AzureOpenAI({
      endpoint: process.env.AZURE_OPENAI_ENDPOINT,
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      apiVersion: process.env.AZURE_OPENAI_API_VERSION ?? "2024-10-21",
      deployment: dep,
    });
    clientCache.set(dep, cached);
  }

  return cached;
}

export function estimateTokenCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
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
