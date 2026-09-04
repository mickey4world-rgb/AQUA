import { collectLoginCandidates, isAllowedLogin } from "@/lib/allowed-users";
import { findLinkedIdentity } from "@/lib/identity-links";
import type { ClientPrincipal } from "@/lib/types/auth";
import type { UpdateUserRequest, User } from "@/lib/types/user";
import { DEFAULT_MONTHLY_TOKEN_LIMIT, getEffectiveMonthlyTokenLimit } from "@/lib/types/user";
import { getEmailFromPrincipal } from "@/lib/client-principal";
import { COSMOS_CONTAINERS, getContainer, isCosmosConfigured } from "@/lib/server/cosmos";

export async function getUserById(userId: string): Promise<User | null> {
  try {
    const { resource } = await getContainer(COSMOS_CONTAINERS.users)
      .item(userId, userId)
      .read<User>();
    return resource ?? null;
  } catch (error) {
    const code = (error as { code?: number }).code;
    if (code === 404) return null;
    throw error;
  }
}

export async function listAllUsers(): Promise<User[]> {
  try {
    const { resources } = await getContainer(COSMOS_CONTAINERS.users)
      .items.query<User>({ query: "SELECT * FROM c" })
      .fetchAll();
    return resources;
  } catch {
    return [];
  }
}

/** 旧上限（100k）のユーザーを DB 上も 1M に引き上げ */
export async function ensureUserTokenLimit(userId: string): Promise<User | null> {
  const user = await getUserById(userId);
  if (!user) return null;
  if (user.monthlyTokenLimit >= DEFAULT_MONTHLY_TOKEN_LIMIT) return user;

  const updated: User = {
    ...user,
    monthlyTokenLimit: DEFAULT_MONTHLY_TOKEN_LIMIT,
    updatedAt: new Date().toISOString(),
  };
  const { resource } = await getContainer(COSMOS_CONTAINERS.users)
    .item(userId, userId)
    .replace(updated);
  return resource ?? updated;
}

export function effectiveTokenLimit(user: User | null | undefined): number {
  return getEffectiveMonthlyTokenLimit(user);
}

function loginNameFromPrincipal(
  principal: ClientPrincipal,
  email: string,
): string {
  if (principal.userDetails.includes("@")) {
    return email.split("@")[0];
  }
  return principal.userDetails;
}

function uniqueStrings(values: Array<string | undefined | null>): string[] {
  const set = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    const trimmed = value.trim();
    if (trimmed) set.add(trimmed);
  }
  return [...set];
}

async function findUserByEmail(email: string): Promise<User | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes("@")) return null;
  const { resources } = await getContainer(COSMOS_CONTAINERS.users)
    .items.query<User>({
      query:
        "SELECT * FROM c WHERE LOWER(c.email) = @email OR LOWER(c.notifyEmail) = @email",
      parameters: [{ name: "@email", value: normalized }],
    })
    .fetchAll();
  return resources[0] ?? null;
}

async function findUserByLinkedAuthId(authId: string): Promise<User | null> {
  const { resources } = await getContainer(COSMOS_CONTAINERS.users)
    .items.query<User>({
      query: "SELECT * FROM c WHERE ARRAY_CONTAINS(c.linkedAuthIds, @authId)",
      parameters: [{ name: "@authId", value: authId }],
    })
    .fetchAll();
  return resources[0] ?? null;
}

async function findSeededUserByLoginName(
  loginName: string,
  email: string,
): Promise<User | null> {
  const emailLocal = email.split("@")[0].toLowerCase();
  const { resources } = await getContainer(COSMOS_CONTAINERS.users)
    .items.query<User>({
      query:
        "SELECT * FROM c WHERE STARTSWITH(c.userId, 'user-') AND (LOWER(c.displayName) = @name OR LOWER(c.email) = @email OR LOWER(@emailLocal) = LOWER(c.displayName))",
      parameters: [
        { name: "@name", value: loginName.toLowerCase() },
        { name: "@email", value: email.toLowerCase() },
        { name: "@emailLocal", value: emailLocal },
      ],
    })
    .fetchAll();
  return resources[0] ?? null;
}

/**
 * 同一人物の既存プロファイルを探す（GitHub / Microsoft を束ねる）。
 * 正規メールのユーザーを最優先し、既存データの userId を維持する。
 */
export async function findCanonicalUserForPrincipal(
  principal: ClientPrincipal,
): Promise<User | null> {
  const rawEmail = getEmailFromPrincipal(principal);
  const link = findLinkedIdentity(
    principal.userDetails,
    rawEmail,
    ...collectLoginCandidates(principal.userDetails, rawEmail),
  );
  const canonicalEmail = link?.email ?? (rawEmail.includes("@") ? rawEmail : "");
  const canonicalLogin =
    link?.canonicalLogin ?? loginNameFromPrincipal(principal, rawEmail);

  const byPrincipal = await getUserById(principal.userId);
  const byLinked = await findUserByLinkedAuthId(principal.userId);
  const byEmail = canonicalEmail ? await findUserByEmail(canonicalEmail) : null;
  const bySeed = await findSeededUserByLoginName(canonicalLogin, canonicalEmail || rawEmail);

  // 正規メールのプロファイルを優先（Microsoft 側の既存データ）
  return byEmail ?? byLinked ?? byPrincipal ?? bySeed;
}

async function migrateSeededUser(
  seeded: User,
  principal: ClientPrincipal,
  email: string,
  now: string,
): Promise<User> {
  const migrated: User = {
    id: principal.userId,
    userId: principal.userId,
    email,
    displayName: seeded.displayName,
    authProvider: principal.identityProvider,
    notifyEmail: seeded.notifyEmail || email,
    monthlyTokenLimit: seeded.monthlyTokenLimit,
    linkedAuthIds: uniqueStrings([...(seeded.linkedAuthIds ?? []), principal.userId]),
    authProviders: uniqueStrings([
      ...(seeded.authProviders ?? []),
      seeded.authProvider,
      principal.identityProvider,
    ]),
    createdAt: seeded.createdAt,
    updatedAt: now,
  };

  await getContainer(COSMOS_CONTAINERS.users)
    .item(seeded.userId, seeded.userId)
    .delete();
  const { resource } = await getContainer(COSMOS_CONTAINERS.users).items.create(
    migrated,
  );
  return resource!;
}

/**
 * SWA principal をアプリ内の正規 userId に付け替える。
 * GitHub mickey4world-rgb → aquaiot@outlook.com の既存プロファイルなど。
 */
export async function resolveCanonicalPrincipal(
  principal: ClientPrincipal,
): Promise<ClientPrincipal> {
  if (!isCosmosConfigured()) return principal;

  try {
    const existing = await findCanonicalUserForPrincipal(principal);
    if (!existing || existing.userId === principal.userId) {
      return {
        ...principal,
        rawUserId: principal.rawUserId ?? principal.userId,
      };
    }
    return {
      ...principal,
      rawUserId: principal.rawUserId ?? principal.userId,
      userId: existing.userId,
    };
  } catch (error) {
    console.warn("[auth] resolveCanonicalPrincipal failed", error);
    return principal;
  }
}

export async function syncUser(principal: ClientPrincipal): Promise<User> {
  const rawEmail = getEmailFromPrincipal(principal);
  if (!isAllowedLogin(principal.userDetails, rawEmail)) {
    throw new Error("FORBIDDEN_USER");
  }

  const link = findLinkedIdentity(
    principal.userDetails,
    rawEmail,
    ...collectLoginCandidates(principal.userDetails, rawEmail),
  );
  const email = link?.email ?? rawEmail;
  const now = new Date().toISOString();
  const authId = principal.rawUserId ?? principal.userId;
  const existing = await findCanonicalUserForPrincipal({
    ...principal,
    userId: authId,
  });

  if (existing && !existing.userId.startsWith("user-")) {
    const updated: User = {
      ...existing,
      email,
      notifyEmail: existing.notifyEmail || email,
      authProvider: principal.identityProvider,
      monthlyTokenLimit: Math.max(
        existing.monthlyTokenLimit,
        DEFAULT_MONTHLY_TOKEN_LIMIT,
      ),
      linkedAuthIds: uniqueStrings([
        ...(existing.linkedAuthIds ?? []),
        authId,
        existing.userId,
      ]),
      authProviders: uniqueStrings([
        ...(existing.authProviders ?? []),
        existing.authProvider,
        principal.identityProvider,
      ]),
      updatedAt: now,
    };
    const { resource } = await getContainer(COSMOS_CONTAINERS.users)
      .item(existing.userId, existing.userId)
      .replace(updated);
    return resource!;
  }

  if (existing?.userId.startsWith("user-")) {
    return migrateSeededUser(
      existing,
      { ...principal, userId: authId },
      email,
      now,
    );
  }

  const newUser: User = {
    id: authId,
    userId: authId,
    email,
    displayName: link ? "Mickey" : principal.userDetails,
    authProvider: principal.identityProvider,
    notifyEmail: email,
    monthlyTokenLimit: DEFAULT_MONTHLY_TOKEN_LIMIT,
    linkedAuthIds: [authId],
    authProviders: [principal.identityProvider],
    createdAt: now,
    updatedAt: now,
  };

  const { resource } = await getContainer(COSMOS_CONTAINERS.users).items.create(
    newUser,
  );
  return resource!;
}

export async function updateUser(
  userId: string,
  updates: UpdateUserRequest,
): Promise<User | null> {
  const existing = await getUserById(userId);
  if (!existing) return null;

  const updated: User = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  const { resource } = await getContainer(COSMOS_CONTAINERS.users)
    .item(userId, userId)
    .replace(updated);
  return resource!;
}
