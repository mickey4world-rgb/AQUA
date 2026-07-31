import type { ClientPrincipal } from "@/lib/types/auth";
import type { UpdateUserRequest, User } from "@/lib/types/user";
import { DEFAULT_MONTHLY_TOKEN_LIMIT } from "@/lib/types/user";
import { getEmailFromPrincipal } from "@/lib/server/auth";
import { getContainer } from "@/lib/server/cosmos";

export async function getUserById(userId: string): Promise<User | null> {
  const { resource } = await getContainer().item(userId, userId).read<User>();
  return resource ?? null;
}

export async function syncUser(principal: ClientPrincipal): Promise<User> {
  const now = new Date().toISOString();
  const email = getEmailFromPrincipal(principal);
  const existing = await getUserById(principal.userId);

  if (existing) {
    const updated: User = {
      ...existing,
      email,
      displayName: principal.userDetails,
      authProvider: principal.identityProvider,
      updatedAt: now,
    };
    const { resource } = await getContainer()
      .item(principal.userId, principal.userId)
      .replace(updated);
    return resource!;
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

  const { resource } = await getContainer().items.create(newUser);
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

  const { resource } = await getContainer()
    .item(userId, userId)
    .replace(updated);
  return resource!;
}
