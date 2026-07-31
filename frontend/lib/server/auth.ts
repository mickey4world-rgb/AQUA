import type { ClientPrincipal } from "@/lib/types/auth";
import { isAllowedLogin } from "@/lib/allowed-users";

export function parseClientPrincipal(
  header: string | null,
): ClientPrincipal | null {
  if (!header) return null;
  try {
    return JSON.parse(Buffer.from(header, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

export function getEmailFromPrincipal(principal: ClientPrincipal): string {
  const emailClaim = principal.claims?.find(
    (c) => c.typ === "emails" || c.typ.includes("email"),
  );
  if (emailClaim?.val) return emailClaim.val;

  if (principal.userDetails.includes("@")) {
    return principal.userDetails;
  }

  return `${principal.userDetails}@users.local`;
}

export function requireAuth(
  header: string | null,
): ClientPrincipal | Response {
  const principal = parseClientPrincipal(header);
  if (!principal) {
    return Response.json(
      { error: "Unauthorized", message: "ログインが必要です" },
      { status: 401 },
    );
  }
  return principal;
}

export function requireAllowedAuth(
  header: string | null,
): ClientPrincipal | Response {
  const auth = requireAuth(header);
  if (auth instanceof Response) return auth;

  const email = getEmailFromPrincipal(auth);
  if (!isAllowedLogin(auth.userDetails, email)) {
    return Response.json(
      {
        error: "Forbidden",
        message: "このアカウントは AQUA Personal Apps へのアクセスが許可されていません",
      },
      { status: 403 },
    );
  }

  return auth;
}
