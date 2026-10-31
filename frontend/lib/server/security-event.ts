import { createHash, randomUUID } from "crypto";
import { extractGeoFromHeaders, parseUserAgent } from "@/lib/client-hints";
import { resolveClientIp } from "@/lib/client-ip";
import { noteSecurityEventForAutoBlock } from "@/lib/server/security-blocklist";
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
  const ip = resolveClientIp(request.headers);
  const userAgent = request.headers.get("user-agent") ?? "unknown";
  const rotatingInput = `${date.toISOString().slice(0, 10)}:${ip}:${userAgent.slice(0, 256)}`;
  return `src-${createHash("sha256").update(rotatingInput).digest("hex").slice(0, 24)}`;
}

function buildEvent(input: RecordSecurityEventInput, now: Date): SecurityEvent {
  const geo = extractGeoFromHeaders(input.request.headers);
  const agent = parseUserAgent(input.request.headers.get("user-agent"));
  return {
    id: randomUUID(),
    bucket: monthBucket(now),
    eventType: input.eventType,
    severity: input.severity,
    action: "blocked",
    method: input.request.method.slice(0, 12),
    path: new URL(input.request.url).pathname.slice(0, 256),
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
}

async function writeEvent(event: SecurityEvent): Promise<void> {
  try {
    await securityEventsContainer().items.create(event);
  } catch (error) {
    console.warn("[security-event] write failed", error instanceof Error ? error.message : error);
  }
}

export async function recordSecurityEvent(
  input: RecordSecurityEventInput,
): Promise<void> {
  if (!isCosmosConfigured()) return;

  const event = buildEvent(input, new Date());
  await writeEvent(event);

  try {
    const decision = await noteSecurityEventForAutoBlock({
      request: input.request,
      eventType: input.eventType,
      severity: input.severity,
      statusCode: input.statusCode,
      path: event.path,
      attackLabel: event.attackLabel,
      country: event.country,
    });
    if (decision.block) {
      const hours = Math.round(decision.durationMs / 3_600_000);
      await writeEvent(
        buildEvent(
          {
            request: input.request,
            eventType: "auto_blocked",
            severity: "high",
            statusCode: 403,
            attackLabel: decision.repeat ? "繰り返し攻撃（再発）" : "繰り返し攻撃",
            reason: `10分間の防御スコア ${Math.round(decision.score)} が閾値を超過（直前: ${event.attackLabel}）`,
            mitigation: `送信元を全APIで${hours}時間自動ブロック`,
          },
          new Date(),
        ),
      );
    }
  } catch (error) {
    console.warn("[security-event] autoblock failed", error instanceof Error ? error.message : error);
  }
}

/** 月をまたぐ直近期間（AI 診断用）。読み取り失敗は 0 件と区別するため throw する */
export async function listSecurityEventsSince(sinceIso: string): Promise<SecurityEvent[]> {
  if (!isCosmosConfigured()) throw new Error("Cosmos DB が未設定です");
  const since = new Date(sinceIso);
  const months = [...new Set([monthBucket(since), monthBucket(new Date())])];
  const lists = await Promise.all(
    months.map(async (month) => {
      const { resources } = await securityEventsContainer()
        .items.query<SecurityEvent>({
          query:
            "SELECT * FROM c WHERE c.bucket = @bucket AND c.createdAt >= @since ORDER BY c.createdAt DESC OFFSET 0 LIMIT 5000",
          parameters: [
            { name: "@bucket", value: month },
            { name: "@since", value: sinceIso },
          ],
        })
        .fetchAll();
      return resources;
    }),
  );
  return lists.flat().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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
