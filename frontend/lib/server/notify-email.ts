/**
 * ユーザー設定の notifyEmail 向け通知メール送信。
 *
 * 優先順:
 * 1) NOTIFY_EMAIL_WEBHOOK_URL（Logic Apps / Power Automate など）
 * 2) RESEND_API_KEY + NOTIFY_EMAIL_FROM
 * 3) AZURE_* + NOTIFY_EMAIL_FROM（Microsoft Graph Mail.Send）
 *
 * 未設定時は送信せず reason を返す（呼び出し側の取引自体は失敗させない）。
 */

export type NotifyEmailPayload = {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  /** ログ用カテゴリ（asset-trade / stock-alert など） */
  category?: string;
};

export type NotifyEmailResult =
  | { ok: true; provider: string }
  | { ok: false; reason: string };

function normalizeRecipients(to: string | string[]): string[] {
  const list = Array.isArray(to) ? to : [to];
  return [
    ...new Set(
      list
        .map((v) => v.trim())
        .filter((v) => v.includes("@")),
    ),
  ];
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function toHtml(text: string, html?: string): string {
  if (html?.trim()) return html;
  return `<pre style="font-family:ui-sans-serif,system-ui,sans-serif;white-space:pre-wrap;line-height:1.5">${escapeHtml(text)}</pre>`;
}

async function sendViaWebhook(
  recipients: string[],
  payload: NotifyEmailPayload,
): Promise<NotifyEmailResult> {
  const url = process.env.NOTIFY_EMAIL_WEBHOOK_URL?.trim();
  if (!url) return { ok: false, reason: "NOTIFY_EMAIL_WEBHOOK_URL unset" };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to: recipients,
      subject: payload.subject,
      text: payload.text,
      html: toHtml(payload.text, payload.html),
      category: payload.category ?? "notify",
      sentAt: new Date().toISOString(),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return {
      ok: false,
      reason: `webhook HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`,
    };
  }
  return { ok: true, provider: "webhook" };
}

async function sendViaResend(
  recipients: string[],
  payload: NotifyEmailPayload,
): Promise<NotifyEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.NOTIFY_EMAIL_FROM?.trim();
  if (!apiKey || !from) {
    return { ok: false, reason: "RESEND_API_KEY / NOTIFY_EMAIL_FROM unset" };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: recipients,
      subject: payload.subject,
      text: payload.text,
      html: toHtml(payload.text, payload.html),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return {
      ok: false,
      reason: `resend HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`,
    };
  }
  return { ok: true, provider: "resend" };
}

async function getGraphAccessToken(): Promise<string | null> {
  const tenantId = process.env.AZURE_TENANT_ID?.trim();
  const clientId = process.env.AZURE_CLIENT_ID?.trim();
  const clientSecret = process.env.AZURE_CLIENT_SECRET?.trim();
  if (!tenantId || !clientId || !clientSecret) return null;

  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
    },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { access_token?: string };
  return data.access_token ?? null;
}

async function sendViaGraph(
  recipients: string[],
  payload: NotifyEmailPayload,
): Promise<NotifyEmailResult> {
  const from = process.env.NOTIFY_EMAIL_FROM?.trim();
  if (!from) return { ok: false, reason: "NOTIFY_EMAIL_FROM unset" };

  const token = await getGraphAccessToken();
  if (!token) {
    return {
      ok: false,
      reason: "Graph token unavailable (AZURE_TENANT_ID / CLIENT_ID / CLIENT_SECRET)",
    };
  }

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(from)}/sendMail`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject: payload.subject,
          body: {
            contentType: "HTML",
            content: toHtml(payload.text, payload.html),
          },
          toRecipients: recipients.map((address) => ({
            emailAddress: { address },
          })),
        },
        saveToSentItems: false,
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return {
      ok: false,
      reason: `graph HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`,
    };
  }
  return { ok: true, provider: "graph" };
}

export function isNotifyEmailConfigured(): boolean {
  if (process.env.NOTIFY_EMAIL_WEBHOOK_URL?.trim()) return true;
  if (process.env.RESEND_API_KEY?.trim() && process.env.NOTIFY_EMAIL_FROM?.trim()) {
    return true;
  }
  if (
    process.env.NOTIFY_EMAIL_FROM?.trim() &&
    process.env.AZURE_TENANT_ID?.trim() &&
    process.env.AZURE_CLIENT_ID?.trim() &&
    process.env.AZURE_CLIENT_SECRET?.trim()
  ) {
    return true;
  }
  return false;
}

export async function sendNotifyEmail(
  payload: NotifyEmailPayload,
): Promise<NotifyEmailResult> {
  const recipients = normalizeRecipients(payload.to);
  if (recipients.length === 0) {
    return { ok: false, reason: "no valid recipients" };
  }

  const attempts: Array<() => Promise<NotifyEmailResult>> = [
    () => sendViaWebhook(recipients, payload),
    () => sendViaResend(recipients, payload),
    () => sendViaGraph(recipients, payload),
  ];

  let last: NotifyEmailResult = { ok: false, reason: "no provider configured" };
  for (const attempt of attempts) {
    try {
      const result = await attempt();
      if (result.ok) {
        console.info(
          `[notify-email] sent via ${result.provider} category=${payload.category ?? "notify"} to=${recipients.join(",")}`,
        );
        return result;
      }
      // unset は次のプロバイダへ。実エラーは記録して続行
      if (!result.reason.includes("unset")) {
        console.warn(`[notify-email] provider failed: ${result.reason}`);
      }
      last = result;
    } catch (error) {
      last = {
        ok: false,
        reason: error instanceof Error ? error.message : "send failed",
      };
      console.warn("[notify-email] provider threw", last.reason);
    }
  }

  return last;
}
