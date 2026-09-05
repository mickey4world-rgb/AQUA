import { logApiAccess } from "@/lib/server/access-log";
import { sanitizeText } from "@/lib/server/security";
import {
  isSolunaStorageConfigured,
  resolveUserIdByShortcutToken,
} from "@/lib/server/soluna-store";
import { sendSolunaChat } from "@/lib/server/soluna-chat";
import { enforcePublicRequestProtection } from "@/lib/server/request-protection";
import { recordSecurityEvent } from "@/lib/server/security-event";

function readShortcutToken(request: Request): string | null {
  return request.headers.get("x-soluna-token")?.trim() ?? null;
}

type ShortcutChatBody = {
  message?: string;
};

export async function POST(request: Request) {
  const startedAt = Date.now();
  const blocked = await enforcePublicRequestProtection(request, {
    scope: "soluna-shortcut-chat",
    maxRequests: 20,
    windowMs: 60_000,
    maxBodyBytes: 16_384,
  });
  if (blocked) return blocked;

  if (!isSolunaStorageConfigured()) {
    const response = Response.json({ error: "Soluna storage is not configured." }, { status: 503 });
    logApiAccess(request, "shortcut", response.status, startedAt);
    return response;
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    const response = Response.json({ error: "Invalid JSON" }, { status: 400 });
    logApiAccess(request, "shortcut", response.status, startedAt);
    return response;
  }

  const body = raw as ShortcutChatBody;
  const token = readShortcutToken(request);
  if (!token) {
    await recordSecurityEvent({
      request,
      eventType: "auth_denied",
      severity: "medium",
      statusCode: 401,
      attackLabel: "Solunaショートカット未認証",
      reason: "x-soluna-tokenヘッダーなし",
      mitigation: "URL・本文からのトークン受付を禁止し、専用ヘッダーで遮断",
    });
    const response = Response.json(
      { error: "x-soluna-token header is required." },
      { status: 401 },
    );
    logApiAccess(request, "shortcut", response.status, startedAt);
    return response;
  }

  const userId = await resolveUserIdByShortcutToken(token);
  if (!userId) {
    await recordSecurityEvent({
      request,
      eventType: "auth_denied",
      severity: "high",
      statusCode: 401,
      attackLabel: "無効なSolunaショートカットトークン",
      reason: "提示されたトークンが登録済み利用者に一致しない",
      mitigation: "ランダムトークン照合で遮断",
    });
    const response = Response.json({ error: "Invalid shortcut token." }, { status: 401 });
    logApiAccess(request, "shortcut", response.status, startedAt);
    return response;
  }

  const message = sanitizeText(typeof body.message === "string" ? body.message : "", 2000);
  const result = await sendSolunaChat(userId, message);
  if (!result.ok) {
    const response = Response.json({ error: result.reason }, { status: 422 });
    logApiAccess(request, userId, response.status, startedAt);
    return response;
  }

  const response = Response.json({
    sol: result.data.sol.content,
    luna: result.data.luna.content,
    solStage: result.data.solStage.label,
    lunaStage: result.data.lunaStage.label,
    solModel: result.data.sol.model,
    lunaModel: result.data.luna.model,
    solModelLabel: result.data.sol.modelLabel,
    lunaModelLabel: result.data.luna.modelLabel,
    costMode: result.data.costMode,
    costReason: result.data.costReason,
  });
  logApiAccess(request, userId, response.status, startedAt);
  return response;
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  const blocked = await enforcePublicRequestProtection(request, {
    scope: "soluna-shortcut-status",
    maxRequests: 30,
    windowMs: 60_000,
  });
  if (blocked) return blocked;

  const token = readShortcutToken(request);
  if (!token) {
    await recordSecurityEvent({
      request,
      eventType: "auth_denied",
      severity: "medium",
      statusCode: 401,
      attackLabel: "Solunaショートカット状態確認の未認証アクセス",
      reason: "x-soluna-tokenヘッダーなし",
      mitigation: "専用ヘッダー認証で遮断",
    });
    const response = Response.json(
      { ok: false, error: "x-soluna-token header required" },
      { status: 401 },
    );
    logApiAccess(request, "shortcut", response.status, startedAt);
    return response;
  }

  const userId = await resolveUserIdByShortcutToken(token);
  if (!userId) {
    await recordSecurityEvent({
      request,
      eventType: "auth_denied",
      severity: "high",
      statusCode: 401,
      attackLabel: "無効なSolunaショートカットトークン",
      reason: "状態確認トークンが登録済み利用者に一致しない",
      mitigation: "ランダムトークン照合で遮断",
    });
  }
  const response = Response.json({
    ok: Boolean(userId),
    app: "Soluna",
    sol: "Sol / Gemini",
    luna: "Luna / Azure OpenAI",
  }, { status: userId ? 200 : 401 });
  logApiAccess(request, userId ?? "shortcut", response.status, startedAt);
  return response;
}
