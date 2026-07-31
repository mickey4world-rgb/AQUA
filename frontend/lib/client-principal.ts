import type { ClientPrincipal } from "@/lib/types/auth";

function decodePrincipalHeader(header: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(header, "base64").toString("utf8");
  }

  const binary = atob(header);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function parseClientPrincipal(
  header: string | null,
): ClientPrincipal | null {
  if (!header) return null;
  try {
    return JSON.parse(decodePrincipalHeader(header)) as ClientPrincipal;
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
