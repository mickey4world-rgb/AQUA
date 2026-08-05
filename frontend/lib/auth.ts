import type { AuthMeResponse, ClientPrincipal } from "./types/auth";

export async function getClientPrincipal(): Promise<ClientPrincipal | null> {
  const res = await fetch("/.auth/me");
  if (!res.ok) return null;
  const data: AuthMeResponse = await res.json();
  return data.clientPrincipal;
}

export function loginUrl(
  provider: "github" | "aad" = "github",
  redirectTo = "/",
  options?: { prompt?: "select_account" | "login" },
): string {
  const params = new URLSearchParams({
    post_login_redirect_uri: redirectTo,
  });
  if (options?.prompt && provider === "aad") {
    params.set("prompt", options.prompt);
  }
  return `/.auth/login/${provider}?${params.toString()}`;
}

export function logoutUrl(redirectTo = "/"): string {
  return `/.auth/logout?post_logout_redirect_uri=${encodeURIComponent(redirectTo)}`;
}

/** ログアウト後に別アカウント選択画面（Microsoft/GitHub）へ誘導 */
export function switchAccountLoginUrl(
  provider: "github" | "aad",
  redirectTo = "/",
): string {
  const loginPath = loginUrl(provider, redirectTo, { prompt: "select_account" });
  return logoutUrl(loginPath);
}
