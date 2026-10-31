import {
  COSMOS_CONTAINERS,
  getContainer,
  isCosmosConfigured,
} from "@/lib/server/cosmos";
import { generateWithGemini, stripJsonFence } from "@/lib/server/gemini";
import { sendNotifyEmail } from "@/lib/server/notify-email";
import { resolveSystemNotifyEmails } from "@/lib/server/notify-recipients";
import { listActiveAutoBlocks } from "@/lib/server/security-blocklist";
import { listSecurityEventsSince } from "@/lib/server/security-event";
import { jstDateString } from "@/lib/server/soluna-system-config";
import {
  TRIAGE_LEVEL_LABEL,
  assessSecurityFindings,
  fallbackTriageActions,
  normalizeSeverity,
  renderTriageMarkdown,
  type TriageAction,
  type TriageAssessment,
  type TriageCollection,
  type TriageFinding,
  type TriageLevel,
  type TriageSecurityEventStats,
} from "@/lib/security-triage";

const TRIAGE_BUCKET = "triage";

export interface SecurityTriageReport {
  id: string;
  bucket: typeof TRIAGE_BUCKET;
  docType: "triage-report";
  dateJst: string;
  generatedAt: string;
  level: TriageLevel;
  headline: string;
  summary: string;
  reasons: string[];
  actions: TriageAction[];
  aiStatus: "ok" | "failed";
  aiModel: string | null;
  aiReason: string | null;
  counts: TriageAssessment["counts"];
  issues: Array<{
    source: TriageFinding["source"];
    severity: TriageFinding["severity"];
    title: string;
    packageName: string | null;
    reason: string;
    ageHours: number | null;
    overdue: boolean;
    url: string | null;
  }>;
  collections: TriageCollection[];
  events: TriageSecurityEventStats | null;
  activeAutoBlocks: number | null;
  openSecurityPrs: number;
  emailStatus: "sent" | "skipped-ok" | "failed";
  emailError: string | null;
  runUrl: string | null;
  markdown: string;
}

export interface SecurityTriageRequest {
  findings?: unknown;
  collections?: unknown;
  openSecurityPrs?: unknown;
  runUrl?: unknown;
}

function container() {
  return getContainer(COSMOS_CONTAINERS.securityEvents);
}

const SOURCES = new Set(["npm-audit", "dependabot", "code-scanning", "secret-scanning"]);

function str(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

/** GHA から来る JSON を信用しすぎない（型・長さを揃える） */
export function parseTriageRequest(body: SecurityTriageRequest): {
  findings: TriageFinding[];
  collections: TriageCollection[];
  openSecurityPrs: Array<{ number: number; title: string; url: string; createdAt: string }>;
  runUrl: string | null;
} {
  const findings: TriageFinding[] = [];
  for (const raw of Array.isArray(body.findings) ? body.findings.slice(0, 500) : []) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const source = str(r.source, 32);
    const id = str(r.id, 120);
    const title = str(r.title, 240);
    if (!source || !SOURCES.has(source) || !id || !title) continue;
    findings.push({
      source: source as TriageFinding["source"],
      id,
      title,
      severity: normalizeSeverity(str(r.severity, 16)),
      packageName: str(r.packageName, 120),
      manifest: str(r.manifest, 200),
      fixAvailable: typeof r.fixAvailable === "boolean" ? r.fixAvailable : null,
      firstSeenAt: str(r.firstSeenAt, 40),
      url: str(r.url, 400),
    });
  }
  const collections: TriageCollection[] = [];
  for (const raw of Array.isArray(body.collections) ? body.collections.slice(0, 20) : []) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const source = str(r.source, 32);
    if (!source || !SOURCES.has(source)) continue;
    collections.push({
      source: source as TriageCollection["source"],
      ok: r.ok === true,
      count: typeof r.count === "number" ? r.count : 0,
      error: str(r.error, 240),
    });
  }
  for (const required of SOURCES) {
    if (!collections.some((c) => c.source === required)) {
      collections.push({ source: required as TriageCollection["source"], ok: false, count: 0, error: "未送信" });
    }
  }
  const openSecurityPrs = (Array.isArray(body.openSecurityPrs) ? body.openSecurityPrs.slice(0, 50) : [])
    .map((raw) => {
      const r = (raw ?? {}) as Record<string, unknown>;
      return {
        number: typeof r.number === "number" ? r.number : 0,
        title: str(r.title, 200) ?? "",
        url: str(r.url, 400) ?? "",
        createdAt: str(r.createdAt, 40) ?? "",
      };
    })
    .filter((pr) => pr.number > 0);
  return { findings, collections, openSecurityPrs, runUrl: str(body.runUrl, 400) };
}

async function loadEventStats(now: Date): Promise<{ stats: TriageSecurityEventStats | null; collection: TriageCollection }> {
  try {
    const since = new Date(now.getTime() - 24 * 3_600_000).toISOString();
    const events = await listSecurityEventsSince(since);
    const byLabel = new Map<string, number>();
    for (const e of events) byLabel.set(e.attackLabel, (byLabel.get(e.attackLabel) ?? 0) + 1);
    return {
      stats: {
        total: events.length,
        high: events.filter((e) => e.severity === "high").length,
        autoBlocked: events.filter((e) => e.eventType === "auto_blocked").length,
        topTargets: [...byLabel.entries()]
          .map(([label, count]) => ({ label, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 8),
      },
      collection: { source: "security-events", ok: true, count: events.length },
    };
  } catch (error) {
    return {
      stats: null,
      collection: {
        source: "security-events",
        ok: false,
        count: 0,
        error: error instanceof Error ? error.message.slice(0, 200) : "読み取り失敗",
      },
    };
  }
}

type AiTriage = { headline: string; summary: string; actions: TriageAction[] };

function parseAiTriage(text: string): AiTriage | null {
  try {
    const parsed = JSON.parse(stripJsonFence(text)) as Record<string, unknown>;
    const headline = str(parsed.headline, 120);
    const summary = str(parsed.summary, 1200);
    if (!headline || !summary) return null;
    const actions: TriageAction[] = [];
    for (const raw of Array.isArray(parsed.actions) ? parsed.actions.slice(0, 10) : []) {
      const r = (raw ?? {}) as Record<string, unknown>;
      const priority = r.priority === "now" || r.priority === "today" || r.priority === "week" ? r.priority : null;
      const title = str(r.title, 160);
      const detail = str(r.detail, 400);
      if (priority && title && detail) actions.push({ priority, title, detail });
    }
    return { headline, summary, actions };
  } catch {
    return null;
  }
}

async function summarizeWithAi(input: {
  assessment: TriageAssessment;
  events: TriageSecurityEventStats | null;
  openSecurityPrs: number;
}): Promise<{ ok: true; value: AiTriage; model: string } | { ok: false; reason: string }> {
  const issues = input.assessment.issues.slice(0, 25).map((i) => ({
    source: i.finding.source,
    severity: i.finding.severity,
    package: i.finding.packageName,
    title: i.finding.title,
    fixAvailable: i.finding.fixAvailable,
    ageHours: i.ageHours == null ? null : Math.floor(i.ageHours),
    overdue: i.overdue,
  }));
  const system = [
    "あなたは個人開発 Web サービス（Next.js on Azure Static Web Apps、Cosmos DB）のセキュリティ担当です。",
    "与えられた診断データだけを根拠に、日本語で簡潔に状況と対処を書いてください。データにない脆弱性や事実を作らないこと。",
    "警戒レベルはルールで確定済みなので変更しないこと。",
    '出力は JSON のみ: {"headline": "40字以内", "summary": "300字以内", "actions": [{"priority": "now|today|week", "title": "...", "detail": "..."}]}',
    "修正版がない（fixAvailable=false）項目には、更新ではなく回避策（機能の無効化・入力制限・WAF ルール等）を提案すること。",
  ].join("\n");
  const user = JSON.stringify({
    level: TRIAGE_LEVEL_LABEL[input.assessment.level],
    reasons: input.assessment.reasons,
    counts: input.assessment.counts,
    issues,
    incompleteSources: input.assessment.incompleteSources,
    securityEvents24h: input.events,
    openSecurityPrs: input.openSecurityPrs,
  });
  const result = await generateWithGemini(
    {
      system,
      messages: [{ role: "user", content: user }],
      maxOutputTokens: 2500,
      temperature: 0.2,
      responseMimeType: "application/json",
    },
    { timeoutMs: 40_000, maxAttempts: 2 },
  );
  if (!result.ok) return { ok: false, reason: result.reason };
  const value = parseAiTriage(result.text);
  if (!value) return { ok: false, reason: "AI の応答が JSON 形式ではありませんでした" };
  return { ok: true, value, model: result.model };
}

const FIRST_SEEN_DOC_ID = "triage-first-seen";

type FirstSeenState = {
  id: typeof FIRST_SEEN_DOC_ID;
  bucket: typeof TRIAGE_BUCKET;
  docType: "triage-first-seen";
  seen: Record<string, string>;
};

/**
 * npm audit には検出日時がないため、初めて見えた日時をここで覚える。
 * 解消した項目は消し、再発したら新しく数え直す。
 */
async function applyFirstSeen(findings: TriageFinding[], now: Date): Promise<TriageFinding[]> {
  if (!isCosmosConfigured()) return findings;
  let state: FirstSeenState | undefined;
  try {
    const { resource } = await container()
      .item(FIRST_SEEN_DOC_ID, TRIAGE_BUCKET)
      .read<FirstSeenState>();
    state = resource;
  } catch {
    state = undefined;
  }
  const previous = state?.seen ?? {};
  const next: Record<string, string> = {};
  const nowIso = now.toISOString();
  const result = findings.map((finding) => {
    const key = `${finding.packageName ?? finding.source}:${finding.id}`.toLowerCase();
    const firstSeenAt = finding.firstSeenAt ?? previous[key] ?? nowIso;
    next[key] = previous[key] && previous[key] < firstSeenAt ? previous[key] : firstSeenAt;
    return { ...finding, firstSeenAt: next[key] };
  });
  await container().items.upsert({
    id: FIRST_SEEN_DOC_ID,
    bucket: TRIAGE_BUCKET,
    docType: "triage-first-seen",
    seen: next,
  } satisfies FirstSeenState);
  return result;
}

export async function runSecurityTriage(body: SecurityTriageRequest): Promise<SecurityTriageReport> {
  const now = new Date();
  const parsedRaw = parseTriageRequest(body);
  const parsed = { ...parsedRaw, findings: await applyFirstSeen(parsedRaw.findings, now) };
  const { stats, collection: eventCollection } = await loadEventStats(now);
  const blocks = await listActiveAutoBlocks();
  const collections: TriageCollection[] = [
    ...parsed.collections,
    eventCollection,
    blocks == null
      ? { source: "autoblock", ok: false, count: 0, error: "自動ブロック一覧の取得失敗" }
      : { source: "autoblock", ok: true, count: blocks.length },
  ];

  const assessment = assessSecurityFindings({
    findings: parsed.findings,
    collections,
    openSecurityPrs: parsed.openSecurityPrs,
    events: stats,
    now,
  });

  const ai = await summarizeWithAi({
    assessment,
    events: stats,
    openSecurityPrs: parsed.openSecurityPrs.length,
  });
  const headline = ai.ok ? ai.value.headline : `${TRIAGE_LEVEL_LABEL[assessment.level]}: ${assessment.reasons[0]}`;
  const summary = ai.ok ? ai.value.summary : assessment.reasons.join(" / ");
  const actions = ai.ok && ai.value.actions.length > 0 ? ai.value.actions : fallbackTriageActions(assessment);
  const dateJst = jstDateString(now);

  const markdown = renderTriageMarkdown({
    dateJst,
    assessment,
    headline,
    summary,
    actions,
    aiStatus: ai.ok ? "ok" : "failed",
    aiReason: ai.ok ? null : ai.reason,
    events: stats,
    runUrl: parsed.runUrl,
  });

  let emailStatus: SecurityTriageReport["emailStatus"] = "skipped-ok";
  let emailError: string | null = null;
  if (assessment.level !== "ok") {
    const to = await resolveSystemNotifyEmails().catch(() => []);
    const sent =
      to.length === 0
        ? { ok: false as const, reason: "通知先メールが未設定" }
        : await sendNotifyEmail({
            to,
            subject: `[AQUA セキュリティ] ${TRIAGE_LEVEL_LABEL[assessment.level]} ${dateJst} — ${headline}`,
            text: markdown,
            category: "security-triage",
          });
    emailStatus = sent.ok ? "sent" : "failed";
    emailError = sent.ok ? null : sent.reason;
  }

  const report: SecurityTriageReport = {
    id: `triage-${dateJst}`,
    bucket: TRIAGE_BUCKET,
    docType: "triage-report",
    dateJst,
    generatedAt: now.toISOString(),
    level: assessment.level,
    headline,
    summary,
    reasons: assessment.reasons,
    actions,
    aiStatus: ai.ok ? "ok" : "failed",
    aiModel: ai.ok ? ai.model : null,
    aiReason: ai.ok ? null : ai.reason,
    counts: assessment.counts,
    issues: assessment.issues.slice(0, 30).map((i) => ({
      source: i.finding.source,
      severity: i.finding.severity,
      title: i.finding.title,
      packageName: i.finding.packageName ?? null,
      reason: i.reason,
      ageHours: i.ageHours == null ? null : Math.floor(i.ageHours),
      overdue: i.overdue,
      url: i.finding.url ?? null,
    })),
    collections,
    events: stats,
    activeAutoBlocks: blocks?.length ?? null,
    openSecurityPrs: parsed.openSecurityPrs.length,
    emailStatus,
    emailError,
    runUrl: parsed.runUrl,
    markdown,
  };

  if (isCosmosConfigured()) {
    await container().items.upsert(report);
  }
  return report;
}

export async function getLatestSecurityTriage(): Promise<SecurityTriageReport | null> {
  if (!isCosmosConfigured()) return null;
  try {
    const { resources } = await container()
      .items.query<SecurityTriageReport>({
        query:
          "SELECT TOP 1 * FROM c WHERE c.bucket = @bucket AND c.docType = 'triage-report' ORDER BY c.generatedAt DESC",
        parameters: [{ name: "@bucket", value: TRIAGE_BUCKET }],
      })
      .fetchAll();
    return resources[0] ?? null;
  } catch (error) {
    console.warn("[security-triage] read failed", error instanceof Error ? error.message : error);
    return null;
  }
}
