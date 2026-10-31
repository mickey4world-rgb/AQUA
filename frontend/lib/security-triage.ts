/**
 * 毎日のセキュリティ診断（純粋関数）。
 * 警戒レベルはルールで決め、AI は要約と対処提案だけを担う。
 * AI が落ちても「重大な未修正がある」ことは必ず通知される。
 */

export type TriageSeverity = "critical" | "high" | "medium" | "low" | "unknown";
export type TriageSource = "npm-audit" | "dependabot" | "code-scanning" | "secret-scanning";
export type TriageLevel = "ok" | "warn" | "critical";

export interface TriageFinding {
  source: TriageSource;
  id: string;
  title: string;
  severity: TriageSeverity;
  packageName?: string | null;
  manifest?: string | null;
  /** 修正版があるか（不明は null） */
  fixAvailable?: boolean | null;
  firstSeenAt?: string | null;
  url?: string | null;
}

export interface TriageCollection {
  source: TriageSource | "security-events" | "autoblock";
  ok: boolean;
  count: number;
  error?: string | null;
}

export interface TriageSecurityEventStats {
  total: number;
  high: number;
  autoBlocked: number;
  topTargets: Array<{ label: string; count: number }>;
}

export interface TriageInput {
  findings: TriageFinding[];
  collections: TriageCollection[];
  openSecurityPrs: Array<{ number: number; title: string; url: string; createdAt: string }>;
  events: TriageSecurityEventStats | null;
  now: Date;
}

export interface TriageIssue {
  finding: TriageFinding;
  ageHours: number | null;
  overdue: boolean;
  reason: string;
}

export interface TriageAssessment {
  level: TriageLevel;
  reasons: string[];
  issues: TriageIssue[];
  counts: Record<TriageSeverity, number>;
  incompleteSources: string[];
}

export const PATCH_SLA_HOURS = 24;
const MEDIUM_SLA_HOURS = 7 * 24;
const SEVERITY_RANK: Record<TriageSeverity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  unknown: 0,
};

export function normalizeSeverity(value: string | null | undefined): TriageSeverity {
  const v = (value ?? "").toLowerCase();
  if (v === "critical") return "critical";
  if (v === "high" || v === "error") return "high";
  if (v === "medium" || v === "moderate" || v === "warning") return "medium";
  if (v === "low" || v === "note" || v === "info") return "low";
  return "unknown";
}

function ageHours(firstSeenAt: string | null | undefined, now: Date): number | null {
  if (!firstSeenAt) return null;
  const at = Date.parse(firstSeenAt);
  if (!Number.isFinite(at)) return null;
  return Math.max(0, (now.getTime() - at) / 3_600_000);
}

/** 同じ脆弱性が npm audit と Dependabot の両方に出るので、パッケージ＋ID で重複を除く */
export function dedupeFindings(findings: TriageFinding[]): TriageFinding[] {
  const map = new Map<string, TriageFinding>();
  for (const finding of findings) {
    const key = `${finding.packageName ?? finding.source}:${finding.id}`.toLowerCase();
    const prev = map.get(key);
    if (!prev) {
      map.set(key, finding);
      continue;
    }
    // 経過時間を持つ方（Dependabot）を優先
    if (!prev.firstSeenAt && finding.firstSeenAt) map.set(key, { ...finding, url: finding.url ?? prev.url });
  }
  return [...map.values()];
}

export function assessSecurityFindings(input: TriageInput): TriageAssessment {
  const findings = dedupeFindings(input.findings);
  const counts: Record<TriageSeverity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    unknown: 0,
  };
  const issues: TriageIssue[] = [];
  const reasons: string[] = [];
  let level: TriageLevel = "ok";
  const raise = (next: TriageLevel) => {
    if (next === "critical" || (next === "warn" && level === "ok")) level = next;
  };

  for (const finding of findings) {
    counts[finding.severity] += 1;
    const age = ageHours(finding.firstSeenAt, input.now);
    const rank = SEVERITY_RANK[finding.severity];

    if (finding.source === "secret-scanning") {
      issues.push({ finding, ageHours: age, overdue: true, reason: "公開リポジトリで秘密情報を検出" });
      continue;
    }
    if (rank >= SEVERITY_RANK.high) {
      const overdue = age != null && age > PATCH_SLA_HOURS && finding.fixAvailable !== false;
      const reason =
        finding.fixAvailable === false
          ? "修正版なし（回避策が必要）"
          : overdue
            ? `修正版があるのに ${Math.floor(age!)} 時間未適用`
            : "重大・高の脆弱性（24時間以内に適用予定）";
      issues.push({ finding, ageHours: age, overdue, reason });
      continue;
    }
    if (rank === SEVERITY_RANK.medium && age != null && age > MEDIUM_SLA_HOURS && finding.fixAvailable !== false) {
      issues.push({ finding, ageHours: age, overdue: true, reason: "中程度が7日以上未適用" });
    }
  }

  const secretLeaks = issues.filter((i) => i.finding.source === "secret-scanning");
  const overdueHigh = issues.filter(
    (i) => i.overdue && SEVERITY_RANK[i.finding.severity] >= SEVERITY_RANK.high && i.finding.source !== "secret-scanning",
  );
  const openHigh = issues.filter((i) => SEVERITY_RANK[i.finding.severity] >= SEVERITY_RANK.high);
  const mediumOverdue = issues.filter((i) => i.finding.severity === "medium");

  if (secretLeaks.length > 0) {
    raise("critical");
    reasons.push(`秘密情報の漏えい検知 ${secretLeaks.length} 件`);
  }
  if (overdueHigh.length > 0) {
    raise("critical");
    reasons.push(`修正版があるのに24時間以上未適用の重大・高 ${overdueHigh.length} 件`);
  }
  if (openHigh.length > overdueHigh.length + secretLeaks.length) {
    raise("warn");
    reasons.push(`未解決の重大・高 ${openHigh.length - overdueHigh.length - secretLeaks.length} 件`);
  }
  if (mediumOverdue.length > 0) {
    raise("warn");
    reasons.push(`7日以上未適用の中程度 ${mediumOverdue.length} 件`);
  }

  const incompleteSources = input.collections.filter((c) => !c.ok).map((c) => c.source);
  if (incompleteSources.length > 0) {
    // 一部が取れていない日は「問題なし」と言わない
    raise("warn");
    reasons.push(`取得できなかった情報源: ${incompleteSources.join(", ")}`);
  }

  if (input.events) {
    if (input.events.autoBlocked > 0) {
      raise("warn");
      reasons.push(`繰り返し攻撃の自動ブロック ${input.events.autoBlocked} 件`);
    }
    if (input.events.high >= 20) {
      raise("warn");
      reasons.push(`高重要度の防御 ${input.events.high} 件（24時間）`);
    }
  }

  issues.sort(
    (a, b) =>
      Number(b.overdue) - Number(a.overdue) ||
      SEVERITY_RANK[b.finding.severity] - SEVERITY_RANK[a.finding.severity] ||
      (b.ageHours ?? 0) - (a.ageHours ?? 0),
  );

  if (reasons.length === 0) reasons.push("未解決の重大・高はなく、全情報源を取得できました");
  return { level, reasons, issues, counts, incompleteSources };
}

export const TRIAGE_LEVEL_LABEL: Record<TriageLevel, string> = {
  ok: "問題なし",
  warn: "要確認",
  critical: "至急対応",
};

export interface TriageAction {
  priority: "now" | "today" | "week";
  title: string;
  detail: string;
}

/** AI が使えない日の代替（ルールだけで作る対処リスト） */
export function fallbackTriageActions(assessment: TriageAssessment): TriageAction[] {
  const actions: TriageAction[] = [];
  for (const issue of assessment.issues.slice(0, 8)) {
    const f = issue.finding;
    const target = f.packageName ? `${f.packageName}（${f.title}）` : f.title;
    if (f.source === "secret-scanning") {
      actions.push({ priority: "now", title: `秘密情報を無効化: ${f.title}`, detail: "該当キーを再発行し、古いキーを失効させる。" });
    } else if (f.fixAvailable === false) {
      actions.push({ priority: issue.overdue ? "now" : "today", title: `回避策を検討: ${target}`, detail: "修正版がないため、該当機能の無効化・入力制限・WAF ルールで緩和する。" });
    } else {
      actions.push({ priority: issue.overdue ? "now" : "today", title: `更新を適用: ${target}`, detail: "Dependabot の修正 PR を確認し、自動マージが止まっていれば原因を直す。" });
    }
  }
  if (assessment.incompleteSources.length > 0) {
    actions.push({ priority: "today", title: "取得失敗の情報源を復旧", detail: `取得できなかった: ${assessment.incompleteSources.join(", ")}` });
  }
  return actions;
}

export function renderTriageMarkdown(input: {
  dateJst: string;
  assessment: TriageAssessment;
  headline: string;
  summary: string;
  actions: TriageAction[];
  aiStatus: "ok" | "failed";
  aiReason?: string | null;
  events: TriageSecurityEventStats | null;
  runUrl?: string | null;
}): string {
  const { assessment } = input;
  const lines: string[] = [];
  lines.push(`## セキュリティ日次診断 ${input.dateJst}（${TRIAGE_LEVEL_LABEL[assessment.level]}）`);
  lines.push("");
  lines.push(`**${input.headline}**`);
  lines.push("");
  lines.push(input.summary);
  lines.push("");
  lines.push("### 判定理由");
  for (const reason of assessment.reasons) lines.push(`- ${reason}`);
  lines.push("");
  if (input.actions.length > 0) {
    lines.push("### 対処");
    const label = { now: "至急", today: "本日中", week: "今週" } as const;
    for (const action of input.actions) lines.push(`- [${label[action.priority]}] ${action.title} — ${action.detail}`);
    lines.push("");
  }
  if (assessment.issues.length > 0) {
    lines.push("### 未解決の項目");
    for (const issue of assessment.issues.slice(0, 20)) {
      const f = issue.finding;
      const age = issue.ageHours == null ? "経過不明" : `${Math.floor(issue.ageHours)}時間経過`;
      const link = f.url ? ` ([詳細](${f.url}))` : "";
      lines.push(`- \`${f.severity}\` ${f.packageName ? `${f.packageName}: ` : ""}${f.title} — ${issue.reason}（${age}）${link}`);
    }
    lines.push("");
  }
  if (input.events) {
    lines.push("### 直近24時間の防御");
    lines.push(`- 遮断 ${input.events.total} 件（高重要度 ${input.events.high} 件、自動ブロック ${input.events.autoBlocked} 件）`);
    for (const t of input.events.topTargets.slice(0, 5)) lines.push(`  - ${t.label}: ${t.count} 件`);
    lines.push("");
  }
  lines.push(
    input.aiStatus === "ok"
      ? "_要約と対処は AI（Gemini）が作成。警戒レベルはルール判定。_"
      : `_AI 要約は失敗したためルール判定のみ（理由: ${input.aiReason ?? "不明"}）。_`,
  );
  if (input.runUrl) lines.push(`\n[実行ログ](${input.runUrl})`);
  return lines.join("\n");
}
