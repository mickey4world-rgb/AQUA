import type { ClientPrincipal } from "@/lib/types/auth";
import { requireAllowedAuth } from "@/lib/server/auth";
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
): Promise<Response> {
  const startedAt = getRequestStartedAt();
  const auth = requireAuthOrResponse(request);
  if (auth instanceof Response) return auth;

  try {
    const response = await handler(auth);
    return finalizeApiResponse(request, auth.userId, response, startedAt);
  } catch (error) {
    console.error("[api]", new URL(request.url).pathname, error);
    const response = Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "サーバー内部エラーが発生しました",
      },
      { status: 500 },
    );
    return finalizeApiResponse(request, auth.userId, response, startedAt);
  }
}
