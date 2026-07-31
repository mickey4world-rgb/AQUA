import { isAllowedLogin } from "@/lib/allowed-users";
import {
  getEmailFromPrincipal,
  parseClientPrincipal,
} from "@/lib/client-principal";

function resolveRoles(request: Request): string[] {
  const principal = parseClientPrincipal(
    request.headers.get("x-ms-client-principal"),
  );
  if (!principal) return [];

  const email = getEmailFromPrincipal(principal);
  if (!isAllowedLogin(principal.userDetails, email)) return [];

  return ["authenticated"];
}

export async function GET(request: Request) {
  return Response.json({ roles: resolveRoles(request) });
}

export async function POST(request: Request) {
  return Response.json({ roles: resolveRoles(request) });
}
