import type { AuthMeResponse, ClientPrincipal } from "./types/auth";

export async function getClientPrincipal(): Promise<ClientPrincipal | null> {
  const res = await fetch("/.auth/me");
  if (!res.ok) return null;
  const data: AuthMeResponse = await res.json();
  return data.clientPrincipal;
}

export function loginUrl(provider: "github" | "aad" = "github"): string {
  return `/.auth/login/${provider}?post_login_redirect_uri=${encodeURIComponent("/")}`;
}

export function logoutUrl(): string {
  return `/.auth/logout?post_logout_redirect_uri=${encodeURIComponent("/")}`;
}
