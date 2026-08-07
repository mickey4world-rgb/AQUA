export interface User {
  id: string;
  userId: string;
  email: string;
  displayName: string;
  authProvider: string;
  notifyEmail: string;
  monthlyTokenLimit: number;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateUserRequest {
  displayName?: string;
  notifyEmail?: string;
}

export const DEFAULT_MONTHLY_TOKEN_LIMIT = 1_000_000;
