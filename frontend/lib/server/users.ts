import { isAllowedLogin } from "@/lib/allowed-users";
import type { ClientPrincipal } from "@/lib/types/auth";
import type { UpdateUserRequest, User } from "@/lib/types/user";
import { DEFAULT_MONTHLY_TOKEN_LIMIT, getEffectiveMonthlyTokenLimit } from "@/lib/types/user";
import { getEmailFromPrincipal } from "@/lib/server/auth";
import { COSMOS_CONTAINERS, getContainer } from "@/lib/server/cosmos";

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

export async function syncUser(principal: ClientPrincipal): Promise<User> {
  const email = getEmailFromPrincipal(principal);
  if (!isAllowedLogin(principal.userDetails, email)) {
    throw new Error("FORBIDDEN_USER");
  }

  const now = new Date().toISOString();
  const existing = await getUserById(principal.userId);

  if (existing) {
    const updated: User = {
      ...existing,
      email,
      authProvider: principal.identityProvider,
      monthlyTokenLimit: Math.max(existing.monthlyTokenLimit, DEFAULT_MONTHLY_TOKEN_LIMIT),
      updatedAt: now,
    };
    const { resource } = await getContainer(COSMOS_CONTAINERS.users)
      .item(principal.userId, principal.userId)
      .replace(updated);
    return resource!;
  }

  const loginName = loginNameFromPrincipal(principal, email);
  const seeded = await findSeededUserByLoginName(loginName, email);
  if (seeded) {
    return migrateSeededUser(seeded, principal, email, now);
  }

  const newUser: User = {
    id: principal.userId,
    userId: principal.userId,
    email,
    displayName: principal.userDetails,
    authProvider: principal.identityProvider,
    notifyEmail: email,
    monthlyTokenLimit: DEFAULT_MONTHLY_TOKEN_LIMIT,
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
