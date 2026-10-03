/**
 * 外出先の株ステーション確認用・段階解除 PIN。
 * AQUA ログイン後にさらに PIN が必要。VM や他アプリの秘密は持たない。
 */
import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "crypto";
import { CosmosClient, type Container } from "@azure/cosmos";
import { COSMOS_CONTAINERS } from "@/lib/server/cosmos";

const COOKIE_NAME = "aqua_kabu_ops";
const UNLOCK_TTL_SEC = 30 * 60;
const PIN_MIN = 6;
const PIN_MAX = 12;

type OpsPinDoc = {
  id: string;
  userId: string;
  docType: "stockOpsPin";
  salt: string;
  hash: string;
  updatedAt: string;
};

let containerCache: Container | null = null;

async function container(): Promise<Container> {
  if (containerCache) return containerCache;
  const endpoint = process.env.COSMOS_ENDPOINT;
  const key = process.env.COSMOS_KEY;
  const databaseId = process.env.COSMOS_DATABASE ?? "personal-apps";
  if (!endpoint || !key) {
    throw new Error("COSMOS_ENDPOINT and COSMOS_KEY must be configured");
  }
  const client = new CosmosClient({ endpoint, key });
  const { database } = await client.databases.createIfNotExists({
    id: databaseId,
  });
  const { container: c } = await database.containers.createIfNotExists({
    id: COSMOS_CONTAINERS.stockBroker,
    partitionKey: { paths: ["/userId"] },
  });
  containerCache = c;
  return c;
}

function pinDocId(userId: string): string {
  return `opsPin-${userId}`;
}

function hmacSecret(): string {
  return (
    process.env.STOCK_OPS_PIN_SECRET?.trim() ||
    process.env.STOCK_KABU_BRIDGE_SECRET?.trim() ||
    process.env.COSMOS_KEY?.trim() ||
    ""
  );
}

function hashPin(pin: string, saltHex: string): string {
  const salt = Buffer.from(saltHex, "hex");
  return scryptSync(pin, salt, 32).toString("hex");
}

export function normalizeOpsPin(raw: string): string | null {
  const pin = raw.trim();
  if (!/^\d+$/.test(pin)) return null;
  if (pin.length < PIN_MIN || pin.length > PIN_MAX) return null;
  return pin;
}

export async function isOpsPinConfigured(userId: string): Promise<boolean> {
  try {
    const { resource } = await (await container())
      .item(pinDocId(userId), userId)
      .read<OpsPinDoc>();
    return Boolean(resource?.hash && resource?.salt);
  } catch {
    return false;
  }
}

export async function setOpsPin(userId: string, pinRaw: string): Promise<void> {
  const pin = normalizeOpsPin(pinRaw);
  if (!pin) {
    throw new Error(`PIN は ${PIN_MIN}〜${PIN_MAX} 桁の数字にしてください`);
  }
  const salt = randomBytes(16).toString("hex");
  const hash = hashPin(pin, salt);
  const doc: OpsPinDoc = {
    id: pinDocId(userId),
    userId,
    docType: "stockOpsPin",
    salt,
    hash,
    updatedAt: new Date().toISOString(),
  };
  await (await container()).items.upsert(doc);
}

export async function verifyOpsPin(
  userId: string,
  pinRaw: string,
): Promise<boolean> {
  const pin = normalizeOpsPin(pinRaw);
  if (!pin) return false;
  try {
    const { resource } = await (await container())
      .item(pinDocId(userId), userId)
      .read<OpsPinDoc>();
    if (!resource?.salt || !resource.hash) return false;
    const next = Buffer.from(hashPin(pin, resource.salt), "hex");
    const prev = Buffer.from(resource.hash, "hex");
    if (next.length !== prev.length) return false;
    return timingSafeEqual(next, prev);
  } catch {
    return false;
  }
}

function signUnlock(userId: string, exp: number): string {
  const secret = hmacSecret();
  if (!secret) throw new Error("ops pin signing secret missing");
  const payload = `${userId}.${exp}`;
  const sig = createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function createOpsUnlockCookieValue(userId: string): {
  value: string;
  maxAge: number;
} {
  const exp = Math.floor(Date.now() / 1000) + UNLOCK_TTL_SEC;
  return { value: signUnlock(userId, exp), maxAge: UNLOCK_TTL_SEC };
}

export function readOpsUnlockFromCookie(
  cookieHeader: string | null,
  userId: string,
): boolean {
  if (!cookieHeader) return false;
  const secret = hmacSecret();
  if (!secret) return false;
  const match = cookieHeader
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${COOKIE_NAME}=`));
  if (!match) return false;
  const value = decodeURIComponent(match.slice(COOKIE_NAME.length + 1));
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  const [uid, expStr, sig] = parts;
  if (uid !== userId) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  const expected = createHmac("sha256", secret)
    .update(`${uid}.${exp}`)
    .digest("hex");
  try {
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function opsUnlockCookieHeader(
  value: string,
  maxAge: number,
): string {
  const secure =
    process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function opsLockCookieHeader(): string {
  const secure =
    process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export { COOKIE_NAME as STOCK_OPS_UNLOCK_COOKIE, UNLOCK_TTL_SEC };
