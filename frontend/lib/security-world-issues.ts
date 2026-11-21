/**
 * 世の中の重要セキュリティ問題 → この環境での該当判定。
 * 毎日の診断で CISA KEV（実際に悪用が確認された脆弱性）・Node.js セキュリティ版・
 * GitHub Advisory（npm 重大/高）を取得し、この構成に当たるかをルールで判定する。
 */

export type WorldIssueJudgment =
  | "affected"
  | "watch"
  | "mitigated"
  | "not_applicable";

export type WorldIssueOrigin = "cisa-kev" | "nodejs" | "ghsa-npm" | "baseline";

export type WorldIssueAssessment = {
  id: string;
  title: string;
  publishedAt: string;
  severity: "critical" | "high" | "medium" | "low";
  judgment: WorldIssueJudgment;
  judgmentLabel: string;
  reason: string;
  sourceUrl: string;
  origin?: WorldIssueOrigin;
  originLabel?: string;
  vendor?: string | null;
  product?: string | null;
  ransomware?: boolean;
};

export type WorldFeedSource = {
  source: "cisa-kev" | "nodejs" | "ghsa-npm";
  ok: boolean;
  count: number;
  checkedAt: string | null;
  error?: string | null;
};

export type WorldFeedItem = {
  origin: "cisa-kev" | "nodejs" | "ghsa-npm";
  id: string;
  title: string;
  vendor: string | null;
  product: string | null;
  publishedAt: string;
  severity: "critical" | "high" | "medium" | "low";
  summary: string;
  ransomware: boolean;
  packageName: string | null;
  installedVersion: string | null;
  nodeMajor: number | null;
  url: string;
};

export type WorldFeed = {
  fetchedAt: string;
  nodeMajor: number;
  sources: WorldFeedSource[];
  items: WorldFeedItem[];
};

export type WorldFeedMeta = {
  fetchedAt: string | null;
  /** 毎日の取得に成功したか（false なら固定の構成前提だけで判定） */
  live: boolean;
  sources: Array<WorldFeedSource & { label: string }>;
  scanned: number;
  notApplicable: number;
};

export type WorldIssueContext = {
  nodeMajor: number;
  behindSwaEdge: boolean;
  exposesRawNodeHttpServer: boolean;
  usesNodeMtlsPerHost: boolean;
  recentDependencyPatches: boolean;
  /** npm audit / Dependabot で開いている GHSA と該当パッケージ */
  openAdvisoryIds: Set<string>;
  openAdvisoryPackages: Set<string>;
};

export const JUDGMENT_LABEL: Record<WorldIssueJudgment, string> = {
  affected: "この環境で問題あり",
  watch: "監視（直接の緊急対応は不要）",
  mitigated: "対策済み・該当しない版",
  not_applicable: "この構成では非該当",
};

export const ORIGIN_LABEL: Record<WorldIssueOrigin, string> = {
  "cisa-kev": "CISA KEV（悪用確認済み）",
  nodejs: "Node.js 公式",
  "ghsa-npm": "GitHub Advisory（npm）",
  baseline: "構成前提（固定）",
};

const FEED_SOURCE_LABEL: Record<WorldFeedSource["source"], string> = {
  "cisa-kev": "CISA KEV 直近30日",
  nodejs: "Node.js セキュリティ版 直近60日",
  "ghsa-npm": "GitHub Advisory npm 重大・高 直近14日",
};

const SEVERITY_SET = new Set(["critical", "high", "medium", "low"]);

export function defaultWorldIssueContext(
  partial?: Partial<WorldIssueContext>,
): WorldIssueContext {
  return {
    nodeMajor: 22,
    behindSwaEdge: true,
    exposesRawNodeHttpServer: false,
    usesNodeMtlsPerHost: false,
    recentDependencyPatches: false,
    openAdvisoryIds: new Set(),
    openAdvisoryPackages: new Set(),
    ...partial,
  };
}

/** この環境で使っている製品（KEV の vendor/product 照合用） */
const STACK_RULES: Array<{
  match: RegExp;
  judgment: WorldIssueJudgment;
  reason: string;
}> = [
  {
    match: /node\.?js/i,
    judgment: "watch",
    reason:
      "本番 API は Azure SWA マネージドの Node で動作し、生の Node サーバーを公開していません。Azure 側のパッチ反映を監視します。",
  },
  {
    match: /next\.?js|vercel/i,
    judgment: "watch",
    reason: "Next.js を使用。修正版は Dependabot が自動 PR→検証→本番反映します。",
  },
  {
    match: /\breact\b/i,
    judgment: "watch",
    reason: "React を使用。該当版かは npm audit / Dependabot が毎日判定します。",
  },
  {
    match: /azure|static web apps|cosmos/i,
    judgment: "watch",
    reason: "Azure のマネージドサービス側の問題で、Microsoft が修正します（利用者側の作業は通常不要）。",
  },
  {
    match: /github/i,
    judgment: "watch",
    reason: "GitHub（リポジトリ・Actions）を利用。GitHub 側の修正と告知を監視します。",
  },
];

function judgeKev(item: WorldFeedItem, ctx: WorldIssueContext) {
  if (item.packageName) {
    const open =
      ctx.openAdvisoryPackages.has(item.packageName.toLowerCase());
    return open
      ? {
          judgment: "affected" as const,
          reason: `依存パッケージ ${item.packageName}${item.installedVersion ? `@${item.installedVersion}` : ""} を使用中で、npm audit / Dependabot でも未解決の指摘があります。`,
        }
      : {
          judgment: "mitigated" as const,
          reason: `依存パッケージ ${item.packageName}${item.installedVersion ? `@${item.installedVersion}` : ""} を使用中ですが、npm audit で該当版の指摘はありません。`,
        };
  }
  const hay = `${item.vendor ?? ""} ${item.product ?? ""}`;
  const rule = STACK_RULES.find((r) => r.match.test(hay));
  if (rule) return { judgment: rule.judgment, reason: rule.reason };
  return {
    judgment: "not_applicable" as const,
    reason: `この環境は ${item.vendor ?? ""} ${item.product ?? ""} を使っていません。`.replace(/\s+/g, " "),
  };
}

function judgeNode(item: WorldFeedItem, ctx: WorldIssueContext) {
  if (item.nodeMajor !== ctx.nodeMajor) {
    return {
      judgment: "not_applicable" as const,
      reason: `本番は Node ${ctx.nodeMajor} 系のため、Node ${item.nodeMajor} 系の更新は対象外です。`,
    };
  }
  if (ctx.exposesRawNodeHttpServer) {
    return {
      judgment: "affected" as const,
      reason: "生の Node サーバーを公開しているため、修正版への更新が必要です。",
    };
  }
  return {
    judgment: "watch" as const,
    reason: `本番の Node ${ctx.nodeMajor} は Azure SWA が管理し、TLS も SWA が終端します。修正版 ${item.title.replace(/^Node\.js\s+|\s+セキュリティ更新$/g, "")} の Azure 反映を監視（アプリ停止は不要）。`,
  };
}

function judgeGhsa(item: WorldFeedItem, ctx: WorldIssueContext) {
  const pkg = (item.packageName ?? "").toLowerCase();
  if (ctx.openAdvisoryIds.has(item.id.toUpperCase()) || (pkg && ctx.openAdvisoryPackages.has(pkg))) {
    return {
      judgment: "affected" as const,
      reason: `依存パッケージ ${item.packageName}${item.installedVersion ? `@${item.installedVersion}` : ""} が該当し、未解決です（自動修正 PR の対象）。`,
    };
  }
  return {
    judgment: "mitigated" as const,
    reason: `依存パッケージ ${item.packageName}${item.installedVersion ? `@${item.installedVersion}` : ""} を使用中ですが、インストール版は npm audit で該当しません。`,
  };
}

const ORDER: Record<WorldIssueJudgment, number> = {
  affected: 0,
  watch: 1,
  mitigated: 2,
  not_applicable: 3,
};

export function assessWorldFeed(
  feed: WorldFeed,
  ctx: WorldIssueContext,
): WorldIssueAssessment[] {
  const out: WorldIssueAssessment[] = [];
  for (const item of feed.items) {
    const judged =
      item.origin === "cisa-kev"
        ? judgeKev(item, ctx)
        : item.origin === "nodejs"
          ? judgeNode(item, ctx)
          : judgeGhsa(item, ctx);
    out.push({
      id: item.id,
      title: item.title,
      publishedAt: item.publishedAt,
      severity: item.severity,
      judgment: judged.judgment,
      judgmentLabel: JUDGMENT_LABEL[judged.judgment],
      reason: judged.reason,
      sourceUrl: item.url,
      origin: item.origin,
      originLabel: ORIGIN_LABEL[item.origin],
      vendor: item.vendor,
      product: item.product,
      ransomware: item.ransomware,
    });
  }
  return out.sort(
    (a, b) =>
      ORDER[a.judgment] - ORDER[b.judgment] ||
      b.publishedAt.localeCompare(a.publishedAt),
  );
}

/** 毎日の取得が無い（旧データ・取得全滅）時だけ使う構成前提の判定 */
export function assessWorldSecurityIssues(
  ctx: WorldIssueContext = defaultWorldIssueContext(),
): WorldIssueAssessment[] {
  const supply: WorldIssueAssessment = {
    id: "baseline-supply-chain",
    title: "依存パッケージの既知脆弱性（供給チェーン）",
    publishedAt: "",
    severity: "high",
    judgment: ctx.recentDependencyPatches ? "mitigated" : "watch",
    judgmentLabel: JUDGMENT_LABEL[ctx.recentDependencyPatches ? "mitigated" : "watch"],
    reason: ctx.recentDependencyPatches
      ? "Dependabot + 自動検証マージで直近の依存修正を適用済みです。"
      : "自動パッチは稼働中。未解決件数は日次診断で確認します。",
    sourceUrl: "https://github.com/advisories",
    origin: "baseline",
    originLabel: ORIGIN_LABEL.baseline,
  };
  const edge: WorldIssueAssessment = {
    id: "baseline-node-edge",
    title: `Node.js ${ctx.nodeMajor} ランタイムの脆弱性全般`,
    publishedAt: "",
    severity: "high",
    judgment: ctx.exposesRawNodeHttpServer ? "affected" : "watch",
    judgmentLabel: JUDGMENT_LABEL[ctx.exposesRawNodeHttpServer ? "affected" : "watch"],
    reason: ctx.exposesRawNodeHttpServer
      ? "生の Node サーバーを公開しているため、修正版への更新が必要です。"
      : "Azure SWA が TLS 終端・ランタイム管理を行い、生の Node サーバーを公開していません。",
    sourceUrl: "https://nodejs.org/en/blog/vulnerability",
    origin: "baseline",
    originLabel: ORIGIN_LABEL.baseline,
  };
  return [edge, supply];
}

/** GHA から来る worldFeed を信用しすぎない */
export function parseWorldFeed(raw: unknown): WorldFeed | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const s = (v: unknown, max: number) =>
    typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
  const fetchedAt = s(r.fetchedAt, 40);
  if (!fetchedAt) return null;
  const sources: WorldFeedSource[] = [];
  for (const src of Array.isArray(r.sources) ? r.sources.slice(0, 5) : []) {
    const x = (src ?? {}) as Record<string, unknown>;
    const name = x.source;
    if (name !== "cisa-kev" && name !== "nodejs" && name !== "ghsa-npm") continue;
    sources.push({
      source: name,
      ok: x.ok === true,
      count: typeof x.count === "number" ? x.count : 0,
      checkedAt: s(x.checkedAt, 40),
      error: s(x.error, 160),
    });
  }
  const items: WorldFeedItem[] = [];
  for (const it of Array.isArray(r.items) ? r.items.slice(0, 150) : []) {
    const x = (it ?? {}) as Record<string, unknown>;
    const origin = x.origin;
    if (origin !== "cisa-kev" && origin !== "nodejs" && origin !== "ghsa-npm") continue;
    const id = s(x.id, 80);
    const title = s(x.title, 240);
    const url = s(x.url, 400);
    if (!id || !title || !url || !/^https:\/\//.test(url)) continue;
    const sev = typeof x.severity === "string" && SEVERITY_SET.has(x.severity) ? x.severity : "high";
    items.push({
      origin,
      id,
      title,
      vendor: s(x.vendor, 120),
      product: s(x.product, 160),
      publishedAt: s(x.publishedAt, 20) ?? "",
      severity: sev as WorldFeedItem["severity"],
      summary: s(x.summary, 300) ?? "",
      ransomware: x.ransomware === true,
      packageName: s(x.packageName, 120),
      installedVersion: s(x.installedVersion, 40),
      nodeMajor: typeof x.nodeMajor === "number" ? x.nodeMajor : null,
      url,
    });
  }
  return {
    fetchedAt,
    nodeMajor: typeof r.nodeMajor === "number" ? r.nodeMajor : 22,
    sources,
    items,
  };
}

export function buildWorldFeedMeta(
  feed: WorldFeed | null,
  assessed: WorldIssueAssessment[],
): WorldFeedMeta {
  if (!feed) {
    return { fetchedAt: null, live: false, sources: [], scanned: 0, notApplicable: 0 };
  }
  return {
    fetchedAt: feed.fetchedAt,
    live: feed.sources.some((x) => x.ok),
    sources: feed.sources.map((x) => ({ ...x, label: FEED_SOURCE_LABEL[x.source] })),
    scanned: feed.sources.reduce((sum, x) => sum + x.count, 0),
    notApplicable: assessed.filter((i) => i.judgment === "not_applicable").length,
  };
}

export function worldIssuesSummaryLabel(
  issues: WorldIssueAssessment[],
): { level: "ok" | "warn" | "critical"; text: string } {
  const affected = issues.filter((i) => i.judgment === "affected").length;
  const watch = issues.filter((i) => i.judgment === "watch").length;
  const na = issues.filter((i) => i.judgment === "not_applicable").length;
  if (affected > 0) {
    return {
      level: "critical",
      text: `世界の重要問題のうち、この環境で「問題あり」が ${affected} 件あります。`,
    };
  }
  if (watch > 0) {
    return {
      level: "warn",
      text: `この環境で問題ありは 0 件。監視 ${watch} 件（ホスト側パッチ待ちなど）、非該当 ${na} 件。`,
    };
  }
  return {
    level: "ok",
    text: `この環境で問題ありは 0 件。掲載 ${issues.length} 件はすべて非該当または対策済みです。`,
  };
}
