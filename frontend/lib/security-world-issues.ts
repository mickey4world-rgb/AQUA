/**
 * 世の中の重要セキュリティ問題 → この環境での該当判定。
 * カタログは人手で更新し、日次診断にも載せる（履歴で当時の判断を残す）。
 */

export type WorldIssueJudgment =
  | "affected"
  | "watch"
  | "mitigated"
  | "not_applicable";

export type WorldIssueAssessment = {
  id: string;
  title: string;
  publishedAt: string;
  severity: "critical" | "high" | "medium" | "low";
  judgment: WorldIssueJudgment;
  judgmentLabel: string;
  reason: string;
  sourceUrl: string;
};

export type WorldIssueContext = {
  /** SWA apiRuntime メジャー（例: 22） */
  nodeMajor: number;
  /** 本番が SWA 背後か */
  behindSwaEdge: boolean;
  /** アプリが生の Node http2/https サーバーを公開していないか */
  exposesRawNodeHttpServer: boolean;
  /** mTLS を Node でホスト別運用しているか */
  usesNodeMtlsPerHost: boolean;
  /** 直近で依存の自動パッチ適用があったか */
  recentDependencyPatches: boolean;
};

type CatalogItem = {
  id: string;
  title: string;
  publishedAt: string;
  severity: WorldIssueAssessment["severity"];
  sourceUrl: string;
  /** 影響し得る Node メジャー */
  nodeMajors: number[];
  assess: (ctx: WorldIssueContext) => Pick<
    WorldIssueAssessment,
    "judgment" | "judgmentLabel" | "reason"
  >;
};

const JUDGMENT_LABEL: Record<WorldIssueJudgment, string> = {
  affected: "この環境で問題あり",
  watch: "監視（直接の緊急対応は不要）",
  mitigated: "緩和済み・該当しにくい",
  not_applicable: "この構成では非該当",
};

/**
 * 2026-11 Node 緊急パッチなど、運用上追うべきリスト。
 * 新しい大事件が出たらここに足す（日次診断の「世界の重要問題」に出る）。
 */
const CATALOG: CatalogItem[] = [
  {
    id: "nodejs-2026-11-http2-tls",
    title: "Node.js 2026-11 セキュリティ更新（HTTP/2・TLS 高深刻度）",
    publishedAt: "2026-11-11",
    severity: "high",
    sourceUrl:
      "https://nodejs.org/en/blog/vulnerability/november-2026-security-releases",
    nodeMajors: [22, 24, 26],
    assess: (ctx) => {
      if (!CATALOG_NODE_MAJORS.includes(ctx.nodeMajor)) {
        return {
          judgment: "not_applicable",
          judgmentLabel: JUDGMENT_LABEL.not_applicable,
          reason: `利用中の Node ${ctx.nodeMajor} はこの系の対象外です。`,
        };
      }
      if (ctx.behindSwaEdge && !ctx.exposesRawNodeHttpServer) {
        return {
          judgment: "watch",
          judgmentLabel: JUDGMENT_LABEL.watch,
          reason:
            "公開面は Azure SWA が TLS を終端し、生の Node HTTP/2 サーバーをインターネットに出していません。パッチ版（22.23.5 等）は Azure Managed Functions 側の反映待ち。アプリ停止は不要です。",
        };
      }
      if (ctx.exposesRawNodeHttpServer) {
        return {
          judgment: "affected",
          judgmentLabel: JUDGMENT_LABEL.affected,
          reason:
            "生の Node HTTP サーバーが公開されているため、公式パッチ版への更新が必要です。",
        };
      }
      return {
        judgment: "watch",
        judgmentLabel: JUDGMENT_LABEL.watch,
        reason: "Node 22 系統は対象。ホスト側パッチ反映を監視してください。",
      };
    },
  },
  {
    id: "nodejs-2026-11-mtls-sni",
    title: "Node.js TLS / mTLS（ホスト別証明書ポリシー迂回）",
    publishedAt: "2026-11-11",
    severity: "high",
    sourceUrl:
      "https://nodejs.org/en/blog/vulnerability/november-2026-security-releases",
    nodeMajors: [22, 24, 26],
    assess: (ctx) => {
      if (!CATALOG_NODE_MAJORS.includes(ctx.nodeMajor)) {
        return {
          judgment: "not_applicable",
          judgmentLabel: JUDGMENT_LABEL.not_applicable,
          reason: "利用中 Node メジャーが対象外です。",
        };
      }
      if (!ctx.usesNodeMtlsPerHost) {
        return {
          judgment: "not_applicable",
          judgmentLabel: JUDGMENT_LABEL.not_applicable,
          reason:
            "認証は SWA Easy Auth + 許可リストであり、Node のホスト別 mTLS を公開していません。",
        };
      }
      return {
        judgment: "affected",
        judgmentLabel: JUDGMENT_LABEL.affected,
        reason: "Node mTLS をホスト別に使っているため、パッチ適用が必要です。",
      };
    },
  },
  {
    id: "supply-chain-autopatch",
    title: "依存パッケージの既知脆弱性（供給チェーン）",
    publishedAt: "2026-01-01",
    severity: "high",
    sourceUrl: "https://github.com/mickey4world-rgb/AQUA/security/dependabot",
    nodeMajors: [20, 22, 24, 26],
    assess: (ctx) => {
      if (ctx.recentDependencyPatches) {
        return {
          judgment: "mitigated",
          judgmentLabel: JUDGMENT_LABEL.mitigated,
          reason:
            "Dependabot + 自動検証マージで直近の依存修正を適用済みです。未解決の重大・高は日次診断の「脆弱性対応」を見てください。",
        };
      }
      return {
        judgment: "watch",
        judgmentLabel: JUDGMENT_LABEL.watch,
        reason:
          "自動パッチパイプラインは稼働中。未解決件数は診断パネルの重大・高で確認します。",
      };
    },
  },
];

const CATALOG_NODE_MAJORS = [22, 24, 26];

export function defaultWorldIssueContext(
  partial?: Partial<WorldIssueContext>,
): WorldIssueContext {
  return {
    nodeMajor: 22,
    behindSwaEdge: true,
    exposesRawNodeHttpServer: false,
    usesNodeMtlsPerHost: false,
    recentDependencyPatches: false,
    ...partial,
  };
}

export function assessWorldSecurityIssues(
  ctx: WorldIssueContext = defaultWorldIssueContext(),
): WorldIssueAssessment[] {
  return CATALOG.map((item) => {
    const judged = item.assess(ctx);
    return {
      id: item.id,
      title: item.title,
      publishedAt: item.publishedAt,
      severity: item.severity,
      sourceUrl: item.sourceUrl,
      ...judged,
    };
  });
}

export function worldIssuesSummaryLabel(
  issues: WorldIssueAssessment[],
): { level: "ok" | "warn" | "critical"; text: string } {
  const affected = issues.filter((i) => i.judgment === "affected").length;
  const watch = issues.filter((i) => i.judgment === "watch").length;
  if (affected > 0) {
    return {
      level: "critical",
      text: `世界の重要問題のうち、この環境で「問題あり」が ${affected} 件あります。`,
    };
  }
  if (watch > 0) {
    return {
      level: "warn",
      text: `緊急の該当なし。監視扱いが ${watch} 件（ホスト側パッチ待ちなど）。`,
    };
  }
  return {
    level: "ok",
    text: "掲載中の重要問題について、この構成では非該当または緩和済みです。",
  };
}
