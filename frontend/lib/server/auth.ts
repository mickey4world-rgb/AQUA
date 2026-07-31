import type { ClientPrincipal } from "@/lib/types/auth";

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
