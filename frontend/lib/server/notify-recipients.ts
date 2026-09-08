import { getUserById, listAllUsers } from "@/lib/server/users";

/**
 * システム資産（Soluna 自動売買）の通知先。
 * env 明示 > Mickey プロファイルの notifyEmail > ログインメール。
 */
export async function resolveSystemNotifyEmails(): Promise<string[]> {
  const fromEnv = [
    process.env.SOLUNA_TRADE_NOTIFY_EMAIL?.trim(),
    process.env.NOTIFY_EMAIL_TO?.trim(),
  ].filter((v): v is string => Boolean(v && v.includes("@")));

  if (fromEnv.length > 0) {
    return [...new Set(fromEnv)];
  }

  const preferredIds = ["user-mickey"];
  for (const id of preferredIds) {
    const user = await getUserById(id).catch(() => null);
    const email = user?.notifyEmail?.trim() || user?.email?.trim();
    if (email?.includes("@")) return [email];
  }

  const users = await listAllUsers().catch(() => []);
  const mickey = users.find(
    (u) =>
      u.email?.toLowerCase() === "aquaiot@outlook.com" ||
      u.notifyEmail?.toLowerCase() === "aquaiot@outlook.com" ||
      u.displayName?.toLowerCase() === "mickey",
  );
  const fallback = mickey?.notifyEmail?.trim() || mickey?.email?.trim();
  return fallback?.includes("@") ? [fallback] : [];
}

export async function resolveUserNotifyEmail(userId: string): Promise<string | null> {
  const user = await getUserById(userId).catch(() => null);
  const email = user?.notifyEmail?.trim() || user?.email?.trim();
  return email?.includes("@") ? email : null;
}
