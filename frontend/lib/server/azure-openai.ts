import { AzureOpenAI } from "openai";

let client: AzureOpenAI | null = null;

export function isAzureOpenAiConfigured(): boolean {
  return Boolean(
    process.env.AZURE_OPENAI_ENDPOINT &&
      process.env.AZURE_OPENAI_API_KEY &&
      process.env.AZURE_OPENAI_DEPLOYMENT,
  );
}

export function getAzureOpenAiDeployment(): string {
  return process.env.AZURE_OPENAI_DEPLOYMENT ?? "gpt-4o-mini";
}

export function getAzureOpenAiClient(): AzureOpenAI {
  if (!isAzureOpenAiConfigured()) {
    throw new Error("Azure OpenAI is not configured");
  }

  if (!client) {
    client = new AzureOpenAI({
      endpoint: process.env.AZURE_OPENAI_ENDPOINT,
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      apiVersion: process.env.AZURE_OPENAI_API_VERSION ?? "2024-10-21",
      deployment: getAzureOpenAiDeployment(),
    });
  }

  return client;
}

export function estimateTokenCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const rates: Record<string, { input: number; output: number }> = {
    "gpt-4o-mini": { input: 0.15 / 1_000_000, output: 0.6 / 1_000_000 },
    "gpt-4o": { input: 2.5 / 1_000_000, output: 10 / 1_000_000 },
  };

  const rate = rates[model] ?? rates["gpt-4o-mini"];
  return promptTokens * rate.input + completionTokens * rate.output;
}
