export type AppKey = "stocks" | "disney" | "costs" | "council" | "docs" | "space" | "users" | "system";

export interface AccessLog {
  id: string;
  userId: string;
  app: AppKey;
  method: string;
  path: string;
  feature: string;
  statusCode: number;
  durationMs: number;
  createdAt: string;
}

export interface RecordAccessLogInput {
  userId: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  app?: AppKey;
  feature?: string;
}
