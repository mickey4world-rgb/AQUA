import { createHash } from "crypto";
import { isIndividualPublicIp, resolveClientIp } from "@/lib/client-ip";
import {
  AUTOBLOCK_REPEAT_BLOCK_MS,
  decideAutoBlock,
  securityEventWeight,
  slideAutoBlockScore,
  type AutoBlockDecision,
  type AutoBlockHit,
} from "@/lib/security-autoblock";
import {
  COSMOS_CONTAINERS,
  getContainer,
  isCosmosConfigured,
} from "@/lib/server/cosmos";
import type {
  SecurityEventSeverity,
  SecurityEventType,
} from "@/lib/types/security-event";

const BLOCKLIST_BUCKET = "blocklist";
const CACHE_TTL_MS = 60_000;
const CACHE_READ_TIMEOUT_MS = 1_500;
const MAX_TRACKED_SOURCES = 5000;

export interface AutoBlockRecord {
  id: string;
  bucket: typeof BLOCKLIST_BUCKET;
  docType: "autoblock";
  key: string;
  blockedUntil: string;
  firstBlockedAt: string;
  lastBlockedAt: string;
  blockCount: number;
  score: number;
  lastPath: string;
  lastAttackLabel: string;
  country: string | null;
}

const hitsBySource = new Map<string, AutoBlockHit[]>();
const localBlocks = new Map<string, number>();
let cachedBlocks = new Map<string, number>();
let cacheLoadedAt = 0;
let cacheRefresh: Promise<void> | null = null;

function container() {
  return getContainer(COSMOS_CONTAINERS.securityEvents);
}

/**
 * IP は保存しない。秘密ソルト付きハッシュで送信元を識別する。
 * 個人を特定できない IP（不明・社内）は null = ブロック対象外（巻き添え防止）。
 */
export function autoBlockKey(request: Request): string | null {
  const ip = resolveClientIp(request.headers);
  if (!isIndividualPublicIp(ip)) return null;
  const salt =
    process.env.SECURITY_HASH_SALT?.trim() || process.env.SOLUNA_CRON_SECRET?.trim() || "aqua";
  return createHash("sha256").update(`autoblock:${salt}:${ip}`).digest("hex").slice(0, 32);
}

function trimTracked(): void {
  if (hitsBySource.size < MAX_TRACKED_SOURCES) return;
  const oldest = hitsBySource.keys().next().value as string | undefined;
  if (oldest) hitsBySource.delete(oldest);
}

async function refreshCache(): Promise<void> {
  const nowIso = new Date().toISOString();
  const { resources } = await container()
    .items.query<Pick<AutoBlockRecord, "key" | "blockedUntil">>({
      query:
        "SELECT c.key, c.blockedUntil FROM c WHERE c.bucket = @bucket AND c.blockedUntil > @now",
      parameters: [
        { name: "@bucket", value: BLOCKLIST_BUCKET },
        { name: "@now", value: nowIso },
      ],
    })
    .fetchAll();
  cachedBlocks = new Map(resources.map((r) => [r.key, Date.parse(r.blockedUntil)]));
  cacheLoadedAt = Date.now();
}

async function ensureCacheFresh(): Promise<void> {
  if (!isCosmosConfigured()) return;
  if (Date.now() - cacheLoadedAt < CACHE_TTL_MS) return;
  cacheRefresh ??= refreshCache().finally(() => {
    cacheRefresh = null;
  });
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, CACHE_READ_TIMEOUT_MS));
  try {
    await Promise.race([cacheRefresh, timeout]);
  } catch (error) {
    // Cosmos 障害時はサイト全体を止めない（各 API の認証・レート制限は独立して効く）
    console.warn(
      "[security-blocklist] cache refresh failed",
      error instanceof Error ? error.message : error,
    );
  }
}

function blockedUntilFor(key: string, now: number): number | null {
  const until = Math.max(localBlocks.get(key) ?? 0, cachedBlocks.get(key) ?? 0);
  return until > now ? until : null;
}

/** ブロック中の送信元なら 403 を返す。記録は作成時の1回だけ（洪水で書き込みを増やさない） */
export async function rejectIfSourceBlocked(request: Request): Promise<Response | null> {
  const key = autoBlockKey(request);
  if (!key) return null;
  await ensureCacheFresh();
  const now = Date.now();
  const until = blockedUntilFor(key, now);
  if (until == null) return null;
  return Response.json(
    { error: "TemporarilyBlocked" },
    {
      status: 403,
      headers: {
        "Retry-After": String(Math.max(1, Math.ceil((until - now) / 1000))),
        "Cache-Control": "no-store",
      },
    },
  );
}

/**
 * 防御イベントをスコアに加算し、閾値を超えたらブロックを永続化する。
 * 返り値が block:true のときだけ呼び出し側が auto_blocked イベントを記録する。
 */
export async function noteSecurityEventForAutoBlock(input: {
  request: Request;
  eventType: SecurityEventType;
  severity: SecurityEventSeverity;
  statusCode: number;
  path: string;
  attackLabel: string;
  country: string | null;
}): Promise<AutoBlockDecision> {
  const weight = securityEventWeight(input);
  if (weight <= 0) return { block: false, score: 0 };

  const key = autoBlockKey(input.request);
  if (!key) return { block: false, score: 0 };
  const now = Date.now();
  if (blockedUntilFor(key, now) != null) return { block: false, score: 0 };

  trimTracked();
  const hits = hitsBySource.get(key) ?? [];
  hits.push({ at: now, weight });
  hitsBySource.set(key, hits);
  const score = slideAutoBlockScore(hits, now);
  const preliminary = decideAutoBlock({ score, blockedWithin24h: false });
  if (!preliminary.block) return preliminary;

  let existing: AutoBlockRecord | undefined;
  if (isCosmosConfigured()) {
    try {
      const { resource } = await container()
        .item(`block-${key}`, BLOCKLIST_BUCKET)
        .read<AutoBlockRecord>();
      existing = resource;
    } catch {
      existing = undefined;
    }
  }
  const lastBlockedAt = existing ? Date.parse(existing.lastBlockedAt) : 0;
  const decision = decideAutoBlock({
    score,
    blockedWithin24h: lastBlockedAt > 0 && now - lastBlockedAt < AUTOBLOCK_REPEAT_BLOCK_MS,
  });
  if (!decision.block) return decision;

  const blockedUntil = now + decision.durationMs;
  localBlocks.set(key, blockedUntil);
  hitsBySource.delete(key);

  if (isCosmosConfigured()) {
    const nowIso = new Date(now).toISOString();
    const record: AutoBlockRecord = {
      id: `block-${key}`,
      bucket: BLOCKLIST_BUCKET,
      docType: "autoblock",
      key,
      blockedUntil: new Date(blockedUntil).toISOString(),
      firstBlockedAt: existing?.firstBlockedAt ?? nowIso,
      lastBlockedAt: nowIso,
      blockCount: (existing?.blockCount ?? 0) + 1,
      score: Math.round(score * 10) / 10,
      lastPath: input.path,
      lastAttackLabel: input.attackLabel.slice(0, 120),
      country: input.country,
    };
    try {
      await container().items.upsert(record);
    } catch (error) {
      console.warn(
        "[security-blocklist] persist failed (instance-local block only)",
        error instanceof Error ? error.message : error,
      );
    }
  }
  return decision;
}

/** 取得失敗は null（0件と区別して画面に出す） */
export async function listActiveAutoBlocks(): Promise<AutoBlockRecord[] | null> {
  if (!isCosmosConfigured()) return null;
  try {
    const { resources } = await container()
      .items.query<AutoBlockRecord>({
        query:
          "SELECT * FROM c WHERE c.bucket = @bucket AND c.blockedUntil > @now ORDER BY c.lastBlockedAt DESC",
        parameters: [
          { name: "@bucket", value: BLOCKLIST_BUCKET },
          { name: "@now", value: new Date().toISOString() },
        ],
      })
      .fetchAll();
    return resources;
  } catch (error) {
    console.warn(
      "[security-blocklist] list failed",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
