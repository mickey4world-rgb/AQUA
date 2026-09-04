export interface User {
  id: string;
  userId: string;
  email: string;
  displayName: string;
  authProvider: string;
  notifyEmail: string;
  monthlyTokenLimit: number;
  /** SWA principal.userId の別名（GitHub / Microsoft など） */
  linkedAuthIds?: string[];
  /** これまでに使った IdP */
  authProviders?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface UpdateUserRequest {
  displayName?: string;
  notifyEmail?: string;
}

export const DEFAULT_MONTHLY_TOKEN_LIMIT = 1_000_000;

/** DB 保存値が旧上限のままでも、常に現行デフォルト以上を適用 */
export function getEffectiveMonthlyTokenLimit(
  user: Pick<User, "monthlyTokenLimit"> | null | undefined,
): number {
  const stored = user?.monthlyTokenLimit ?? DEFAULT_MONTHLY_TOKEN_LIMIT;
  return Math.max(stored, DEFAULT_MONTHLY_TOKEN_LIMIT);
}
