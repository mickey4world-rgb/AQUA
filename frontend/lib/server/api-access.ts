import type { ClientPrincipal } from "@/lib/types/auth";
import { requireAllowedAuth } from "@/lib/server/auth";
import { resolveCanonicalPrincipal } from "@/lib/server/users";
import { logApiAccess } from "@/lib/server/access-log";
import { recordSecurityEvent } from "@/lib/server/security-event";

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
  if (authOrResponse instanceof Response) {
    await recordSecurityEvent({
      request,
      eventType: "auth_denied",
      severity: authOrResponse.status === 403 ? "high" : "medium",
      statusCode: authOrResponse.status,
      attackLabel:
        authOrResponse.status === 403
          ? "許可されていないアカウント"
          : "未認証の保護APIアクセス",
      reason:
        authOrResponse.status === 403
          ? "認証済みだがAQUA許可リスト外"
          : "有効なAzure Static Web Apps認証情報なし",
      mitigation: "Azure認証とAQUAアカウント許可リストで遮断",
    });
    return authOrResponse;
  }

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
