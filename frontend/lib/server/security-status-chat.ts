/**
 * コスト画面セキュリティ報告向けチャット。
 * 質問時点で最新の診断・攻撃集計・部品インベントリを読み、そのスナップショットだけを根拠に答える。
 */
import {
  generateWithGemini,
  isGeminiConfigured,
} from "@/lib/server/gemini";
import { buildSecurityAnalyticsReport } from "@/lib/server/security-analytics";
import { recordTokenUsage } from "@/lib/server/token-usage";
import { isWorldBuzzIssue, worldIssueOpenUrl } from "@/lib/security-world-issues";
import type { SecurityAnalyticsReport } from "@/lib/types/analytics";

const MAX_MESSAGE = 800;
const MAX_HISTORY = 8;
const MAX_REPLY = 1200;

export type SecurityChatTurn = { role: "user" | "assistant"; content: string };

function currentMonthJst(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
  }).format(now);
}

function clip(s: string, max: number): string {
  const t = s.trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

/** チャット用の最新状況テキスト（モデルに渡す正本） */
export function buildSecurityChatContext(
  report: SecurityAnalyticsReport,
  askedAtIso: string,
): string {
  const t = report.latestTriage;
  const buzz = report.worldIssues.filter((i) => isWorldBuzzIssue(i)).slice(0, 8);
  const affected = report.worldIssues.filter((i) => i.judgment === "affected").slice(0, 6);
  const stackLines = report.architectureLayers.flatMap((layer) =>
    layer.components.map(
      (c) =>
        `- [${layer.id}] ${c.name}${c.version ? ` ${c.version}` : ""} · ${c.kindLabel} · ${c.inUse ? "使用中" : "未使用/間接"} · ${c.role}`,
    ),
  );
  const recent = report.recentEvents.slice(0, 8).map(
    (e) =>
      `- ${e.createdAt} ${e.attackLabel} ${e.method} ${e.path} (${e.country})`,
  );

  return [
    `質問受付時刻（ISO）: ${askedAtIso}`,
    `集計月: ${report.monthLabel}`,
    `部品要約: ${report.stackInventory.summary}`,
    ...report.stackInventory.clarifications.map((c) => `補足: ${c}`),
    "",
    "## 守りの層と部品",
    ...stackLines,
    "",
    "## 日次診断",
    t
      ? [
          `レベル: ${t.level}`,
          `実施: ${t.generatedAt}（${t.ageHours}時間前）`,
          `見出し: ${t.headline}`,
          `要約: ${t.summary}`,
          `未解決: 重大 ${t.counts.critical} / 高 ${t.counts.high} / 中 ${t.counts.medium}`,
          `AI: ${t.aiStatus}${t.aiModel ? ` (${t.aiModel})` : ""}`,
        ].join("\n")
      : "日次診断データなし",
    "",
    "## 世界の重要問題（この環境の該当）",
    report.worldIssuesSummary.text,
    affected.length
      ? affected
          .map((i) => {
            const url = worldIssueOpenUrl(i);
            return `- 問題あり: ${i.title} (${i.id}) ${url ?? ""}`;
          })
          .join("\n")
      : "- 問題あり: 0件",
    "",
    "## 世界で注目（悪用確認・重大・ランサム）",
    buzz.length
      ? buzz
          .map((i) => {
            const url = worldIssueOpenUrl(i);
            return `- ${i.title} [${i.judgmentLabel}] ${url ?? ""}`;
          })
          .join("\n")
      : "- なし",
    "",
    `## 今月の防御（アプリ記録）`,
    `遮断 ${report.summary.blockedEvents} 回 / 高重要度 ${report.summary.highSeverityEvents} / 送信元 ${report.summary.uniqueSources}`,
    report.coverageNote,
    recent.length ? recent.join("\n") : "- 防御記録なし",
    "",
    `自動ブロック中: ${report.activeAutoBlocks?.length ?? 0} 件`,
  ].join("\n");
}

const SYSTEM = `あなたは AQUA のセキュリティ状況アシスタントです。
ユーザーはプロダクトマネージャーです。専門用語は最小限、日本語で短く答えてください。

## 絶対ルール
- 下の「最新スナップショット」に書いてある事実だけを根拠にする
- スナップショットに無い攻撃・CVE・設定は「このデータにはありません」と言う
- 推測で「侵入された」「安全」と言い切らない。診断レベルと件数で述べる
- Next.js / Hono / Express の有無はスナップショットの部品欄に従う（Hono は間接依存でアプリ枠組みではない）
- URL がスナップショットにあれば、必要なら1つだけ添える
- 400〜800字。見出し記号 # は使わず、短い段落と「-」箇条書きのみ`;

export async function answerSecurityStatusChat(input: {
  userId: string;
  message: string;
  history?: SecurityChatTurn[];
  month?: string;
}): Promise<
  | {
      ok: true;
      reply: string;
      model: string;
      askedAt: string;
      snapshot: {
        month: string;
        triageAgeHours: number | null;
        blockedEvents: number;
        stackSummary: string;
      };
    }
  | { ok: false; reason: string }
> {
  if (!isGeminiConfigured()) {
    return { ok: false, reason: "Gemini が未設定のため、セキュリティチャットを使えません。" };
  }

  const message = clip(input.message ?? "", MAX_MESSAGE);
  if (!message) return { ok: false, reason: "質問を入力してください。" };

  const askedAt = new Date().toISOString();
  const month = input.month && /^\d{4}-\d{2}$/.test(input.month)
    ? input.month
    : currentMonthJst();

  let report: SecurityAnalyticsReport;
  try {
    report = await buildSecurityAnalyticsReport(month);
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof Error
          ? `最新のセキュリティ状況を読めませんでした: ${error.message}`
          : "最新のセキュリティ状況を読めませんでした。",
    };
  }

  const context = buildSecurityChatContext(report, askedAt);
  const history = (input.history ?? [])
    .filter((h) => h.role === "user" || h.role === "assistant")
    .slice(-MAX_HISTORY)
    .map((h) => `${h.role === "user" ? "ユーザー" : "助手"}: ${clip(h.content, 500)}`)
    .join("\n");

  const prompt = [
    "## 最新スナップショット（これ以外は根拠にしない）",
    context,
    history ? `\n## 直前の会話\n${history}` : "",
    `\n## 今回の質問\n${message}`,
    "\n上記スナップショットだけを根拠に、質問に答えてください。",
  ].join("\n");

  const result = await generateWithGemini(
    {
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
      maxOutputTokens: 1024,
      temperature: 0.2,
    },
    { timeoutMs: 45_000, maxAttempts: 2 },
  );

  if (!result.ok) {
    return { ok: false, reason: result.reason };
  }

  const reply = clip(result.text.replace(/\r/g, "").trim(), MAX_REPLY);
  if (!reply) {
    return { ok: false, reason: "モデルから空の応答が返りました。" };
  }

  await recordTokenUsage({
    userId: input.userId,
    feature: "security-status-chat",
    model: result.model,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
  }).catch(() => undefined);

  return {
    ok: true,
    reply,
    model: result.model,
    askedAt,
    snapshot: {
      month: report.month,
      triageAgeHours: report.latestTriage?.ageHours ?? null,
      blockedEvents: report.summary.blockedEvents,
      stackSummary: report.stackInventory.summary,
    },
  };
}
