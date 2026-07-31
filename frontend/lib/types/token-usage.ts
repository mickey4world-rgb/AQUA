export interface TokenUsage {
  id: string;
  userId: string;
  feature: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd?: number;
  requestId?: string;
  createdAt: string;
}

export interface RecordTokenUsageInput {
  userId: string;
  feature: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  requestId?: string;
}
