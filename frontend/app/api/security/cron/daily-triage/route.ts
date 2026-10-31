import { createHash } from "crypto";
import { resolveClientIp } from "@/lib/client-ip";
import { requestHasAutomationSecret } from "@/lib/server/automation-auth";
import { isCosmosConfigured } from "@/lib/server/cosmos";
import { recordSecurityEvent } from "@/lib/server/security-event";
import { runSecurityTriage, type SecurityTriageRequest } from "@/lib/server/security-triage";

export const maxDuration = 120;

/** 公開ログ向けに失敗理由を粗い分類だけにする（宛先やキー名を出さない） */
function failureCode(reason: string): string {
  const r = reason.toLowerCase();
  if (r.includes("未設定") || r.includes("unset") || r.includes("no provider")) return "not-configured";
  if (r.includes("recipient") || r.includes("通知先")) return "no-recipient";
  if (r.includes("タイムアウト") || r.includes("timeout")) return "timeout";
  if (r.includes("json")) return "invalid-ai-output";
  if (r.includes("混雑") || r.includes("429") || r.includes("quota")) return "rate-limited";
  if (/\b(401|403)\b/.test(r)) return "auth-error";
  return "provider-error";
}

export async function POST(request: Request) {
  if (!requestHasAutomationSecret(request, [process.env.SOLUNA_CRON_SECRET])) {
    await recordSecurityEvent({
      request,
      eventType: "automation_auth_denied",
      severity: "high",
      statusCode: 401,
      attackLabel: "セキュリティ日次診断への不正アクセス",
      reason: "有効な自動タスク秘密情報なし",
      mitigation: "専用Bearer秘密情報の照合で遮断",
    });
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isCosmosConfigured()) {
    return Response.json({ ok: false, error: "Cosmos DB が未設定です。" }, { status: 503 });
  }

  let body: SecurityTriageRequest;
  try {
    body = (await request.json()) as SecurityTriageRequest;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const report = await runSecurityTriage(body);
    // 公開リポジトリの Actions ログに出るため、脆弱性の中身は返さない
    return Response.json({
      ok: true,
      level: report.level,
      aiStatus: report.aiStatus,
      emailStatus: report.emailStatus,
      incompleteSources: report.collections.filter((c) => !c.ok).map((c) => c.source),
      aiFailure: report.aiReason ? failureCode(report.aiReason) : null,
      emailFailure: report.emailError ? failureCode(report.emailError) : null,
      // 自動ブロックが本当の送信元で判定できているかを GHA 側の自 IP と照合する
      resolvedIpHash: createHash("sha256")
        .update(resolveClientIp(request.headers))
        .digest("hex")
        .slice(0, 12),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "診断に失敗しました";
    console.error("[security-triage] failed", message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
