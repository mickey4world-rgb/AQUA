export type SecurityEventType =
  | "auth_denied"
  | "automation_auth_denied"
  | "rate_limited"
  | "invalid_request";

export type SecurityEventSeverity = "low" | "medium" | "high";

export interface SecurityEvent {
  id: string;
  bucket: string;
  eventType: SecurityEventType;
  severity: SecurityEventSeverity;
  action: "blocked";
  method: string;
  path: string;
  statusCode: number;
  sourceHash: string;
  country: string | null;
  region: string | null;
  browser: string;
  deviceType: string;
  attackLabel: string;
  reason: string;
  mitigation: string;
  createdAt: string;
}

export interface RecordSecurityEventInput {
  request: Request;
  eventType: SecurityEventType;
  severity: SecurityEventSeverity;
  statusCode: number;
  attackLabel: string;
  reason: string;
  mitigation: string;
}
