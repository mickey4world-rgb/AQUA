import { logApiAccess } from "@/lib/server/access-log";
import { sanitizeText } from "@/lib/server/security";
import {
  isSolunaStorageConfigured,
  resolveUserIdByShortcutToken,
} from "@/lib/server/soluna-store";
import { sendSolunaChat } from "@/lib/server/soluna-chat";
import { canUseAiTokens } from "@/lib/server/token-usage";

function readShortcutToken(request: Request): string | null {
  return request.headers.get("x-soluna-token")?.trim() ?? null;
}

type ShortcutChatBody = {
  message?: string;
};

export async function POST(request: Request) {
  const startedAt = Date.now();

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
    const response = Response.json(
      { error: "x-soluna-token header is required." },
      { status: 401 },
    );
    logApiAccess(request, "shortcut", response.status, startedAt);
    return response;
  }

  const userId = await resolveUserIdByShortcutToken(token);
  if (!userId) {
    const response = Response.json({ error: "Invalid shortcut token." }, { status: 401 });
    logApiAccess(request, "shortcut", response.status, startedAt);
    return response;
  }

  const quota = await canUseAiTokens(userId);
  if (!quota.allowed) {
    const response = Response.json(
      { error: "Monthly AI usage limit reached." },
      { status: 429 },
    );
    logApiAccess(request, userId, response.status, startedAt);
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
  const token = readShortcutToken(request);
  if (!token) {
    const response = Response.json(
      { ok: false, error: "x-soluna-token header required" },
      { status: 401 },
    );
    logApiAccess(request, "shortcut", response.status, startedAt);
    return response;
  }

  const userId = await resolveUserIdByShortcutToken(token);
  const response = Response.json({
    ok: Boolean(userId),
    app: "Soluna",
    sol: "Sol / Gemini",
    luna: "Luna / Azure OpenAI",
  });
  logApiAccess(request, userId ?? "shortcut", response.status, startedAt);
  return response;
}
