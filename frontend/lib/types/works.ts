export type WorksChatRole = "user" | "assistant";

export interface WorksChatMessage {
  role: WorksChatRole;
  content: string;
}

/** 相談テーマ — システムプロンプトの切り替えに使う */
export type WorksTopicId = "claude-code" | "architecture" | "ai" | "general";

export interface WorksTopic {
  id: WorksTopicId;
  label: string;
  hint: string;
}

export const WORKS_TOPICS: WorksTopic[] = [
  {
    id: "claude-code",
    label: "Claude Code 実装",
    hint: "この AQUA を Claude Code で作り込む相談。実装手順とプロンプト設計まで。",
  },
  {
    id: "architecture",
    label: "設計・インフラ",
    hint: "Next.js / Azure / Cosmos DB などの構成とトレードオフの相談。",
  },
  {
    id: "ai",
    label: "AI 活用",
    hint: "モデル選定、プロンプト設計、コスト最適化の相談。",
  },
  {
    id: "general",
    label: "IT 全般",
    hint: "技術調査、ツール比較、学習ロードマップなど。",
  },
];

export function resolveWorksTopic(id: string | undefined): WorksTopic {
  return WORKS_TOPICS.find((t) => t.id === id) ?? WORKS_TOPICS[0];
}

/** チャット結果から生成する、Claude Code に渡せる形のまとめ */
export interface WorkNoteDraft {
  title: string;
  summary: string;
  steps: string[];
  claudePrompt: string;
  tags: string[];
}

export interface WorkNote extends WorkNoteDraft {
  id: string;
  userId: string;
  topic: WorksTopicId;
  model: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorksConsultResponse {
  reply: string;
  model: string;
  freeTier: boolean;
}

export interface WorksSummaryResponse {
  draft: WorkNoteDraft;
  model: string;
}

export function workNoteToMarkdown(note: WorkNoteDraft): string {
  const steps = note.steps.map((step, i) => `${i + 1}. ${step}`).join("\n");
  const tags = note.tags.map((tag) => `#${tag}`).join(" ");

  return `# ${note.title}

${note.summary}

## 実装ステップ

${steps || "- （なし）"}

## Claude Code 用プロンプト

\`\`\`
${note.claudePrompt}
\`\`\`

${tags}
`;
}
