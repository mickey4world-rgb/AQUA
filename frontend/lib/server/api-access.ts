import type { ClientPrincipal } from "@/lib/types/auth";
import { requireAllowedAuth } from "@/lib/server/auth";
import { resolveCanonicalPrincipal } from "@/lib/server/users";
import { logApiAccess } from "@/lib/server/access-log";

export function getRequestStartedAt(): number {
  return Date.now();
}

export function requireAuthOrResponse(
  request: Request,
): ClientPrincipal | Response {
  return requireAllowedAuth(request.headers.get("x-ms-client-principal"));
}

export function finalizeApiResponse(
  request: Request,
  userId: string,
  response: Response,
  startedAt: number,
): Response {
  logApiAccess(request, userId, response.status, startedAt);
  return response;
}

export async function withApiAccessLog(
  request: Request,
  handler: (auth: ClientPrincipal) => Promise<Response>,
  options?: { skipAccessLog?: boolean },
): Promise<Response> {
  const startedAt = getRequestStartedAt();
  const authOrResponse = requireAuthOrResponse(request);
  if (authOrResponse instanceof Response) return authOrResponse;

  const auth = await resolveCanonicalPrincipal(authOrResponse);

  try {
    const response = await handler(auth);
    if (options?.skipAccessLog) return response;
    return finalizeApiResponse(request, auth.userId, response, startedAt);
  } catch (error) {
    const requestId = crypto.randomUUID();
    console.error("[api]", requestId, new URL(request.url).pathname, error);
    const response = Response.json(
      {
        error: "サーバー内部エラーが発生しました",
        requestId,
      },
      { status: 500 },
    );
    if (options?.skipAccessLog) return response;
    return finalizeApiResponse(request, auth.userId, response, startedAt);
  }
}
