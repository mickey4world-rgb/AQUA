/**
 * ソース依存以外の「ホストが許す版」に合わせたランタイム揃え（純粋関数）。
 * 制約の正本は Azure Static Web Apps Managed API（apiRuntime）。
 * SWA が載せない版（例: node:24）へは上げない＝無駄な分岐を作らない。
 */

export const SWA_CONFIG_PATH = "frontend/staticwebapp.config.json";
export const FRONTEND_PACKAGE_PATH = "frontend/package.json";
export const GEMINI_PROXY_PACKAGE_PATH = "gemini-proxy/package.json";
export const KABU_BRIDGE_PACKAGE_PATH = "tools/kabu-bridge/package.json";

export type PlatformPinKind =
  | "swa-api-runtime"
  | "workflow-node"
  | "engines"
  | "docs";

export type PlatformPin = {
  kind: PlatformPinKind;
  path: string;
  /** いまのメジャー（例: 22）。取れなければ null */
  currentMajor: number | null;
  detail: string;
};

export type PlatformAlignPlan = {
  /** SWA ドキュメントから読んだ最大 Node メジャー */
  swaMaxMajor: number | null;
  /** このリポジトリが目指す版（＝ SWA 上限） */
  targetMajor: number | null;
  pins: PlatformPin[];
  /** target より古いピン */
  behind: PlatformPin[];
  /** target より新しいピン（ホスト制約を超えている可能性） */
  ahead: PlatformPin[];
  parseError: string | null;
};

const NODE_API_RUNTIME_RE = /node:(\d+)/gi;
const WORKFLOW_NODE_RE = /node-version:\s*["'](\d+)["']/g;
const ENGINES_NODE_RE = /"node"\s*:\s*"(?:>=)?(\d+)(?:\.\d+)*(?:\.x)?"/;
const DOCS_NODE_RE = /Node(?:\.js)?\s+(\d+)/gi;

/** Learn の表から `node:N` の最大メジャーを取る */
export function parseSwaNodeMaxMajor(htmlOrMarkdown: string): number | null {
  let max: number | null = null;
  for (const match of htmlOrMarkdown.matchAll(NODE_API_RUNTIME_RE)) {
    const major = Number(match[1]);
    if (!Number.isFinite(major)) continue;
    if (max == null || major > max) max = major;
  }
  return max;
}

export function readApiRuntimeMajor(configJson: string): number | null {
  try {
    const parsed = JSON.parse(configJson) as { platform?: { apiRuntime?: string } };
    const m = /^node:(\d+)$/i.exec(parsed.platform?.apiRuntime?.trim() ?? "");
    return m ? Number(m[1]) : null;
  } catch {
    return null;
  }
}

export function readEnginesMajor(packageJson: string): number | null {
  const m = ENGINES_NODE_RE.exec(packageJson);
  return m ? Number(m[1]) : null;
}

export function listWorkflowNodePins(
  files: Array<{ path: string; content: string }>,
): PlatformPin[] {
  const pins: PlatformPin[] = [];
  for (const file of files) {
    for (const match of file.content.matchAll(WORKFLOW_NODE_RE)) {
      pins.push({
        kind: "workflow-node",
        path: file.path,
        currentMajor: Number(match[1]),
        detail: `node-version: "${match[1]}"`,
      });
    }
  }
  return pins;
}

export function buildAlignPlan(input: {
  swaDocsText: string;
  swaConfigJson: string;
  packages: Array<{ path: string; content: string }>;
  workflows: Array<{ path: string; content: string }>;
  docs?: Array<{ path: string; content: string }>;
}): PlatformAlignPlan {
  const swaMaxMajor = parseSwaNodeMaxMajor(input.swaDocsText);
  const parseError =
    swaMaxMajor == null
      ? "SWA のドキュメントから node:N を読めませんでした（自動更新を見送り）"
      : null;
  const targetMajor = swaMaxMajor;

  const pins: PlatformPin[] = [
    {
      kind: "swa-api-runtime",
      path: SWA_CONFIG_PATH,
      currentMajor: readApiRuntimeMajor(input.swaConfigJson),
      detail: "platform.apiRuntime",
    },
    ...input.packages.map((pkg) => ({
      kind: "engines" as const,
      path: pkg.path,
      currentMajor: readEnginesMajor(pkg.content),
      detail: "engines.node",
    })),
    ...listWorkflowNodePins(input.workflows),
  ];

  for (const doc of input.docs ?? []) {
    for (const match of doc.content.matchAll(DOCS_NODE_RE)) {
      const major = Number(match[1]);
      // 18 未満は歴史記述の可能性が高いので無視
      if (major < 18) continue;
      pins.push({
        kind: "docs",
        path: doc.path,
        currentMajor: major,
        detail: match[0],
      });
    }
  }

  const behind =
    targetMajor == null
      ? []
      : pins.filter((p) => p.currentMajor != null && p.currentMajor < targetMajor);
  const ahead =
    targetMajor == null
      ? []
      : pins.filter((p) => p.currentMajor != null && p.currentMajor > targetMajor);

  return { swaMaxMajor, targetMajor, pins, behind, ahead, parseError };
}

/** ファイル内容を target メジャーに置換。変更なければ null */
export function applyNodeMajorToFile(
  path: string,
  content: string,
  targetMajor: number,
): string | null {
  let next = content;
  if (path === SWA_CONFIG_PATH || path.endsWith("staticwebapp.config.json")) {
    next = next.replace(
      /("apiRuntime"\s*:\s*")node:\d+(")/i,
      `$1node:${targetMajor}$2`,
    );
  } else if (path.endsWith("package.json")) {
    next = next.replace(
      /("node"\s*:\s*")(?:>=)?\d+(?:\.\d+)*(?:\.x)?(")/,
      `$1>=${targetMajor}$2`,
    );
  } else if (path.endsWith(".yml") || path.endsWith(".yaml")) {
    next = next.replace(
      /(node-version:\s*["'])\d+(["'])/g,
      `$1${targetMajor}$2`,
    );
  } else if (path.endsWith(".md")) {
    next = next.replace(/Node(?:\.js)?\s+\d+/gi, (hit) => {
      const major = Number(/(\d+)/.exec(hit)?.[1] ?? "0");
      if (major < 18) return hit;
      return hit.replace(String(major), String(targetMajor));
    });
    next = next.replace(/node:(\d+)/gi, (hit, major) => {
      if (Number(major) < 18) return hit;
      return `node:${targetMajor}`;
    });
    next = next.replace(/（Node\s+\d+）/g, `（Node ${targetMajor}）`);
  } else {
    return null;
  }
  return next === content ? null : next;
}

export function filesToAlign(
  plan: PlatformAlignPlan,
): Array<{ path: string; reason: string }> {
  if (plan.targetMajor == null) return [];
  const paths = new Map<string, string>();
  for (const pin of [...plan.behind, ...plan.ahead]) {
    const reason =
      pin.currentMajor != null && pin.currentMajor > plan.targetMajor
        ? `ホスト上限 ${plan.targetMajor} を超えているため戻す`
        : `SWA 上限 ${plan.targetMajor} に上げる`;
    paths.set(pin.path, reason);
  }
  return [...paths.entries()].map(([path, reason]) => ({ path, reason }));
}
