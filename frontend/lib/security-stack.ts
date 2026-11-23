/**
 * セキュリティ画面「守りの層」に載せる利用部品インベントリ。
 * 素人契約: Next.js / Hono など「何を使っているか／使っていないか」が層ごとに読める。
 */
import pkg from "../package.json";

export type SecurityStackKind =
  | "app"
  | "platform"
  | "data"
  | "ai"
  | "transitive"
  | "not_used";

export type SecurityStackComponent = {
  name: string;
  version: string | null;
  kind: SecurityStackKind;
  kindLabel: string;
  role: string;
  /** この環境のアプリ枠組みとして実際に使っているか */
  inUse: boolean;
};

export type SecurityStackLayer = {
  layerId: string;
  components: SecurityStackComponent[];
};

export type SecurityStackInventory = {
  generatedAt: string;
  nodeMajor: number | null;
  summary: string;
  layers: SecurityStackLayer[];
  /** よく誤解されやすいもの（Hono など） */
  clarifications: string[];
};

const KIND_LABEL: Record<SecurityStackKind, string> = {
  app: "アプリ本体",
  platform: "ホスト・基盤",
  data: "データ",
  ai: "AI",
  transitive: "間接依存",
  not_used: "未使用",
};

function depVersion(name: string): string | null {
  const deps = {
    ...(pkg.dependencies ?? {}),
    ...(pkg.devDependencies ?? {}),
  } as Record<string, string>;
  const raw = deps[name];
  if (!raw) return null;
  return raw.replace(/^[\^~>=<\s]+/, "") || raw;
}

function nodeMajorFromEngines(): number | null {
  const raw = (pkg as { engines?: { node?: string } }).engines?.node ?? "";
  const m = /(\d+)/.exec(raw);
  return m ? Number(m[1]) : null;
}

function component(
  name: string,
  kind: SecurityStackKind,
  role: string,
  opts?: { version?: string | null; inUse?: boolean },
): SecurityStackComponent {
  return {
    name,
    version: opts?.version ?? null,
    kind,
    kindLabel: KIND_LABEL[kind],
    role,
    inUse: opts?.inUse ?? (kind !== "not_used" && kind !== "transitive"),
  };
}

/** package.json と既知のホスト構成から、層ごとの部品一覧を組み立てる（純粋・同期） */
export function buildSecurityStackInventory(
  now: Date = new Date(),
): SecurityStackInventory {
  const nodeMajor = nodeMajorFromEngines();
  const nextVer = depVersion("next");
  const reactVer = depVersion("react");
  const cosmosVer = depVersion("@azure/cosmos");
  const openaiVer = depVersion("openai");

  // Hono は package-lock 上の間接依存（MCP SDK 経由）。アプリの HTTP 枠組みではない。
  const honoInLock = true;

  const layers: SecurityStackLayer[] = [
    {
      layerId: "edge",
      components: [
        component("Azure Static Web Apps", "platform", "HTTPS 終端・静的配信・Managed Functions"),
        component("TLS（SWA 終端）", "platform", "証明書と暗号化はホスト側。アプリは生 Node HTTP を公開しない"),
        component(
          `Node.js ${nodeMajor ?? "22"}（SWA apiRuntime）`,
          "platform",
          "Managed API のランタイム。SWA が載せる上限に合わせて揃える",
          { version: nodeMajor != null ? String(nodeMajor) : null },
        ),
      ],
    },
    {
      layerId: "auth",
      components: [
        component("SWA Easy Auth", "platform", "ログインとロール（authenticated / anonymous）"),
        component("許可リスト", "app", "許可されていないユーザーのログイン拒否"),
        component("Cron / Bridge 秘密情報", "app", "自動タスクは Bearer 秘密情報のみ（ブラウザ Cookie ではない）"),
      ],
    },
    {
      layerId: "app",
      components: [
        component("Next.js", "app", "UI と API（Route Handlers）。AQUA のアプリ枠組み", {
          version: nextVer,
          inUse: true,
        }),
        component("React", "app", "画面描画", { version: reactVer, inUse: true }),
        component("Next.js Route Handlers", "app", "API 実装。Express / Hono サーバーは立てていない", {
          inUse: true,
        }),
        component("レート制限・入力検証・自動ブロック", "app", "不正アクセスをアプリ層で遮断し SecurityEvents に記録"),
        component("Hono", honoInLock ? "transitive" : "not_used", "アプリの HTTP 枠組みではない。間接依存として lock に存在するだけ", {
          version: null,
          inUse: false,
        }),
        component("Express", "not_used", "使用していない", { inUse: false }),
      ],
    },
    {
      layerId: "supply",
      components: [
        component("Azure Cosmos DB", "data", "SecurityEvents・診断・株・Soluna などの永続化", {
          version: cosmosVer,
          inUse: true,
        }),
        component("Dependabot + 自動検証マージ", "platform", "依存パッケージの既知脆弱性を自動 PR→検証→本番"),
        component("CodeQL / npm audit / 日次診断", "platform", "毎朝の脆弱性・世界の重要問題の照合"),
        component("Gemini（診断・本チャット）", "ai", "日次要約とセキュリティ状況チャット", {
          inUse: true,
        }),
        component("Azure OpenAI SDK（openai）", "ai", "一部機能のモデル呼び出し用クライアント", {
          version: openaiVer,
          inUse: Boolean(openaiVer),
        }),
      ],
    },
  ];

  const clarifications = [
    `アプリの Web 枠組みは Next.js ${nextVer ?? "（版不明）"} の Route Handlers です。Hono / Express サーバーは使いません。`,
    "Hono が lockfile に見えても、MCP SDK 経由の間接依存であり、守りの層の入口ではありません。",
    `ホストは Azure Static Web Apps（Node ${nodeMajor ?? 22}）。生の Node HTTP をインターネットに晒していません。`,
  ];

  return {
    generatedAt: now.toISOString(),
    nodeMajor,
    summary: `Next.js ${nextVer ?? "?"} / React ${reactVer ?? "?"} / Node ${nodeMajor ?? "?"} · データは Cosmos · 入口は Azure SWA`,
    layers,
    clarifications,
  };
}

export function stackComponentsForLayer(
  inventory: SecurityStackInventory,
  layerId: string,
): SecurityStackComponent[] {
  return inventory.layers.find((l) => l.layerId === layerId)?.components ?? [];
}
