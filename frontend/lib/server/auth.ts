import type { ClientPrincipal } from "@/lib/types/auth";
import {
  getEmailFromPrincipal,
  parseClientPrincipal,
} from "@/lib/client-principal";
import { isAllowedLogin } from "@/lib/allowed-users";

export { getEmailFromPrincipal, parseClientPrincipal };

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
