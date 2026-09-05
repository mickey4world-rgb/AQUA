import { createHash, randomUUID } from "crypto";
import { extractGeoFromHeaders, parseUserAgent } from "@/lib/client-hints";
import {
  COSMOS_CONTAINERS,
  getContainer,
  isCosmosConfigured,
} from "@/lib/server/cosmos";
import type {
  RecordSecurityEventInput,
  SecurityEvent,
} from "@/lib/types/security-event";

function securityEventsContainer() {
  return getContainer(COSMOS_CONTAINERS.securityEvents);
}

function monthBucket(date: Date): string {
  return date.toISOString().slice(0, 7);
}

function sourceFingerprint(request: Request, date: Date): string {
  const forwarded = request.headers.get("x-azure-clientip")
    ?? request.headers.get("x-forwarded-for")
    ?? request.headers.get("cf-connecting-ip")
    ?? "unknown";
  const userAgent = request.headers.get("user-agent") ?? "unknown";
  const rotatingInput = `${date.toISOString().slice(0, 10)}:${forwarded.slice(0, 256)}:${userAgent.slice(0, 256)}`;
  return `src-${createHash("sha256").update(rotatingInput).digest("hex").slice(0, 24)}`;
}

export async function recordSecurityEvent(
  input: RecordSecurityEventInput,
): Promise<void> {
  if (!isCosmosConfigured()) return;

  const now = new Date();
  const geo = extractGeoFromHeaders(input.request.headers);
  const agent = parseUserAgent(input.request.headers.get("user-agent"));
  const pathname = new URL(input.request.url).pathname.slice(0, 256);
  const event: SecurityEvent = {
    id: randomUUID(),
    bucket: monthBucket(now),
    eventType: input.eventType,
    severity: input.severity,
    action: "blocked",
    method: input.request.method.slice(0, 12),
    path: pathname,
    statusCode: input.statusCode,
    sourceHash: sourceFingerprint(input.request, now),
    country: geo.country?.slice(0, 8) ?? null,
    region: geo.region?.slice(0, 64) ?? null,
    browser: agent.browser,
    deviceType: agent.deviceType,
    attackLabel: input.attackLabel.slice(0, 120),
    reason: input.reason.slice(0, 240),
    mitigation: input.mitigation.slice(0, 240),
    createdAt: now.toISOString(),
  };

  try {
    await securityEventsContainer().items.create(event);
  } catch (error) {
    console.warn("[security-event] write failed", error instanceof Error ? error.message : error);
  }
}

export async function listSecurityEvents(
  month: string,
  limit = 5000,
): Promise<SecurityEvent[]> {
  if (!isCosmosConfigured()) return [];

  try {
    const { resources } = await securityEventsContainer()
      .items.query<SecurityEvent>({
        query:
          "SELECT * FROM c WHERE c.bucket = @bucket ORDER BY c.createdAt DESC OFFSET 0 LIMIT @limit",
        parameters: [
          { name: "@bucket", value: month },
          { name: "@limit", value: limit },
        ],
      })
      .fetchAll();
    return resources;
  } catch (error) {
    console.warn("[security-event] read failed", error instanceof Error ? error.message : error);
    return [];
  }
}
