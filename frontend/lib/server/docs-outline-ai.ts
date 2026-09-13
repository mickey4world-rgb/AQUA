import {
  getAzureOpenAiClient,
  getAzureOpenAiDeployment,
  isAzureOpenAiConfigured,
} from "@/lib/server/azure-openai";
import {
  formatAttachmentsForPrompt,
  normalizeAttachments,
} from "@/lib/server/council-attachments";
import {
  canUseAiTokens,
  defaultStockAiModel,
  recordTokenUsage,
} from "@/lib/server/token-usage";
import { DOCS_DEFAULT_SLIDES, DOCS_MAX_SLIDES } from "@/lib/docs-utils";
import type {
  DocCloudArchitecture,
  DocCloudArchEdge,
  DocCloudArchNode,
  DocCloudProvider,
  DocOutline,
  DocSlideLayout,
  DocSlideOutline,
  DocSlideVisual,
  DocVisualType,
  DocsChatMessage,
} from "@/lib/types/docs";
import { ensureOutlineImages } from "@/lib/server/docs-stock-images";
import {
  listAzureServicesForPrompt,
  normalizeAzureServiceId,
} from "@/lib/server/docs-azure-icons";
import {
  listAwsServicesForPrompt,
  normalizeAwsServiceId,
} from "@/lib/server/docs-aws-icons";
import { enrichCloudArchCosts } from "@/lib/server/docs-cloud-arch";

const AZURE_SERVICE_LIST = listAzureServicesForPrompt();
const AWS_SERVICE_LIST = listAwsServicesForPrompt();

const SYSTEM_PROMPT = `あなたは内部提案向け PowerPoint の構成・編集デザインを設計する専門家です。
Gamma / Presenti のような「余白・階層・図解・写真」優先の緻密な資料を目指します。
クラウド構成の依頼では、公式クラウドアイコンの想定構成図＋サービス一覧＋月額想定費用を必ず含めます。
ユーザーの依頼に基づき、JSON のみで返してください。

## 出力形式（厳守）
- マークダウンや説明文は禁止。JSON オブジェクト1つのみ
- スライドは ${DOCS_DEFAULT_SLIDES} 枚前後（最大 ${DOCS_MAX_SLIDES} 枚）
- 日本語。です・ます調。簡潔
- **1スライド1メッセージ**: 箇条書きは最大4点、各32文字以内
- keyMessage は任意だが、本文では1行（28文字以内）のリード文を推奨
- 文字だけのスライドは禁止。visual / cards / twoColumn / stat / image / cloudArch のいずれかを使う
- visual.labels は2〜5個、各10文字以内

## 画像（image）
- 表紙（title）は必ず image（placement: "hero"）
- content の約半数に image。cloudArch がある場合は cloudArch を優先
- query は英語 2〜6語。実在企業ロゴ連想は禁止
- cards / twoColumn / stat / cloudArch には image 不要

## クラウド構成図（cloudArch）— 最重要
- 依頼に AWS が含まれる（Amazon / Lambda / S3 / EC2 / Bedrock 等）→ provider:"aws"
- 依頼に Azure が含まれる、またはクラウド全般で AWS 指定なし → provider:"azure"
- layout "cloudArch" を **1枚**（タイトル例: 「想定 Azure 構成」または「想定 AWS 構成」）
- cloudArch: { provider, caption, nodes, edges }
- nodes は 4〜7個。各 { id, service, label, monthlyCostJpy? }
  - monthlyCostJpy は日本円の月額想定（概算）。省略可（サーバがカタログ補完）
- Azure service 許可: ${AZURE_SERVICE_LIST}
- AWS service 許可: ${AWS_SERVICE_LIST}
- edges 3〜6本。指示が曖昧でもベストプラクティスで想定構成を描く（空禁止）
- Azure Web例: front-door → app-service → cosmos-db + key-vault + entra-id + monitor
- Azure AI例: app-service → openai + search + storage + key-vault
- AWS Web例: cloudfront → alb/api-gateway → ecs-fargate or lambda → dynamodb/rds + secrets-manager + cognito + cloudwatch
- AWS AI例: api-gateway → lambda → bedrock + s3 + opensearch + cloudwatch

## layout
- "title" | "section" | "content" | "twoColumn" | "cards" | "stat" | "cloudArch" | "closing"
- "azureArch" も後方互換で可（provider azure 扱い）

## JSON 例（AWS）
{
  "documentTitle": "AWS 基盤提案",
  "slides": [
    { "layout": "title", "title": "表紙", "subtitle": "想定構成", "bullets": [], "image": { "query": "cloud infrastructure", "placement": "hero" } },
    {
      "layout": "cloudArch",
      "title": "想定 AWS 構成",
      "keyMessage": "マネージド中心で運用負荷を抑える",
      "bullets": ["CloudFront で配信", "Lambda で API", "DynamoDB で永続化"],
      "cloudArch": {
        "provider": "aws",
        "caption": "想定構成（指示内容からの推定）",
        "nodes": [
          { "id": "cf", "service": "cloudfront", "label": "配信", "monthlyCostJpy": 6000 },
          { "id": "apigw", "service": "api-gateway", "label": "API", "monthlyCostJpy": 5000 },
          { "id": "fn", "service": "lambda", "label": "処理", "monthlyCostJpy": 4000 },
          { "id": "db", "service": "dynamodb", "label": "データ", "monthlyCostJpy": 12000 },
          { "id": "sec", "service": "secrets-manager", "label": "秘密情報", "monthlyCostJpy": 2000 },
          { "id": "mon", "service": "cloudwatch", "label": "監視", "monthlyCostJpy": 6000 }
        ],
        "edges": [
          { "from": "cf", "to": "apigw" },
          { "from": "apigw", "to": "fn" },
          { "from": "fn", "to": "db" },
          { "from": "fn", "to": "sec" },
          { "from": "fn", "to": "mon" }
        ]
      }
    },
    { "layout": "closing", "title": "次のアクション", "bullets": ["構成レビュー", "PoC"], "visual": { "type": "timeline", "labels": ["合意", "PoC", "展開"] } }
  ]
}`;

function trimHistory(history: DocsChatMessage[]): DocsChatMessage[] {
  return history.slice(-6);
}

function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  return JSON.parse(candidate);
}

function isLayout(value: unknown): value is DocSlideLayout {
  return (
    value === "title" ||
    value === "section" ||
    value === "content" ||
    value === "twoColumn" ||
    value === "cards" ||
    value === "stat" ||
    value === "cloudArch" ||
    value === "azureArch" ||
    value === "closing"
  );
}

function isVisualType(value: unknown): value is DocVisualType {
  return (
    value === "flow" ||
    value === "comparison" ||
    value === "timeline" ||
    value === "pyramid" ||
    value === "icons"
  );
}

function parseVisual(raw: unknown): DocSlideVisual | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  if (!isVisualType(obj.type)) return undefined;
  const labels = Array.isArray(obj.labels)
    ? obj.labels.map((l) => String(l).trim()).filter(Boolean).slice(0, 5)
    : [];
  if (labels.length < 2) return undefined;
  return { type: obj.type, labels };
}

function parseImage(raw: unknown): DocSlideOutline["image"] | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  const query = String(obj.query ?? "")
    .trim()
    .replace(/[^\w\s\-]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 60);
  if (query.length < 3) return undefined;
  const placement =
    obj.placement === "hero" || obj.placement === "side"
      ? obj.placement
      : undefined;
  return { query, placement };
}

function parseCloudArch(
  raw: unknown,
  fallbackProvider: DocCloudProvider = "azure",
): DocCloudArchitecture | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.nodes)) return undefined;

  const provider: DocCloudProvider =
    obj.provider === "aws" || obj.provider === "azure"
      ? obj.provider
      : fallbackProvider;

  const nodes: DocCloudArchNode[] = [];
  const seen = new Set<string>();
  for (const row of obj.nodes) {
    if (!row || typeof row !== "object") continue;
    const n = row as Record<string, unknown>;
    const id = String(n.id ?? "")
      .trim()
      .replace(/[^\w\-]/g, "")
      .slice(0, 24);
    const serviceRaw = String(n.service ?? "");
    const service =
      provider === "aws"
        ? normalizeAwsServiceId(serviceRaw)
        : normalizeAzureServiceId(serviceRaw);
    const label = String(n.label ?? "").trim().slice(0, 18);
    if (!id || !service || !label || seen.has(id)) continue;
    seen.add(id);
    const monthly =
      typeof n.monthlyCostJpy === "number" && Number.isFinite(n.monthlyCostJpy)
        ? Math.max(0, Math.round(n.monthlyCostJpy))
        : undefined;
    nodes.push({ id, service, label, monthlyCostJpy: monthly });
    if (nodes.length >= 8) break;
  }
  if (nodes.length < 3) return undefined;

  const idSet = new Set(nodes.map((n) => n.id));
  const edges: DocCloudArchEdge[] = [];
  if (Array.isArray(obj.edges)) {
    for (const row of obj.edges) {
      if (!row || typeof row !== "object") continue;
      const e = row as Record<string, unknown>;
      const from = String(e.from ?? "").trim();
      const to = String(e.to ?? "").trim();
      if (!idSet.has(from) || !idSet.has(to) || from === to) continue;
      edges.push({
        from,
        to,
        label: e.label ? String(e.label).trim().slice(0, 12) : undefined,
      });
      if (edges.length >= 10) break;
    }
  }

  return enrichCloudArchCosts({
    provider,
    caption: obj.caption ? String(obj.caption).trim().slice(0, 48) : undefined,
    nodes,
    edges: edges.length ? edges : undefined,
    costNote: obj.costNote ? String(obj.costNote).trim().slice(0, 80) : undefined,
  });
}

function parseSlide(raw: unknown): DocSlideOutline | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const layout = obj.layout;
  const title = String(obj.title ?? "").trim();
  if (!isLayout(layout) || !title) return null;

  const bullets = Array.isArray(obj.bullets)
    ? obj.bullets.map((b) => String(b).trim()).filter(Boolean).slice(0, 5)
    : [];

  const columns = Array.isArray(obj.columns)
    ? obj.columns
        .map((col) => {
          if (!col || typeof col !== "object") return null;
          const c = col as Record<string, unknown>;
          const colTitle = String(c.title ?? "").trim();
          const colBullets = Array.isArray(c.bullets)
            ? c.bullets.map((b) => String(b).trim()).filter(Boolean).slice(0, 4)
            : [];
          if (!colTitle || !colBullets.length) return null;
          return { title: colTitle, bullets: colBullets };
        })
        .filter((c): c is { title: string; bullets: string[] } => Boolean(c))
        .slice(0, 2)
    : undefined;

  const cardDetails = Array.isArray(obj.cardDetails)
    ? obj.cardDetails.map((d) => String(d).trim()).filter(Boolean).slice(0, 4)
    : undefined;

  const stats = Array.isArray(obj.stats)
    ? obj.stats
        .map((row) => {
          if (!row || typeof row !== "object") return null;
          const s = row as Record<string, unknown>;
          const value = String(s.value ?? "").trim();
          const label = String(s.label ?? "").trim();
          if (!value || !label) return null;
          return { value, label };
        })
        .filter((s): s is { value: string; label: string } => Boolean(s))
        .slice(0, 4)
    : undefined;

  const visual = parseVisual(obj.visual);
  const image = parseImage(obj.image);
  const cloudArch =
    parseCloudArch(obj.cloudArch) ??
    parseCloudArch(obj.azureArch, "azure");
  const keyMessage = obj.keyMessage
    ? String(obj.keyMessage).trim().slice(0, 40)
    : undefined;

  const normalizedLayout: DocSlideLayout =
    layout === "azureArch" ? "cloudArch" : layout;

  if (
    (normalizedLayout === "cloudArch" || layout === "azureArch") &&
    !cloudArch
  ) {
    return null;
  }

  return {
    layout: normalizedLayout,
    title: title.slice(0, 48),
    subtitle: obj.subtitle ? String(obj.subtitle).trim().slice(0, 60) : undefined,
    keyMessage,
    bullets,
    columns: columns?.length === 2 ? columns : undefined,
    cardDetails: cardDetails?.length ? cardDetails : undefined,
    stats: stats?.length ? stats : undefined,
    visual,
    image,
    cloudArch,
  };
}

function looksLikeAwsRequest(text: string): boolean {
  return /\baws\b|amazon\s*web|lambda|s3\b|ec2\b|dynamodb|bedrock|cloudfront|api\s*gateway|fargate|\beks\b|\becs\b/i.test(
    text,
  );
}

function looksLikeCloudRequest(text: string): boolean {
  return (
    looksLikeAwsRequest(text) ||
    /azure|クラウド|構成図|インフラ|App\s*Service|Functions?|Cosmos|OpenAI|AKS|SWA|Static\s*Web|Key\s*Vault|Entra|VNet|Container\s*Apps|アーキテクチャ|システム構成/i.test(
      text,
    )
  );
}

function defaultCloudArch(
  provider: DocCloudProvider,
  kind: "web" | "ai",
): DocCloudArchitecture {
  if (provider === "aws") {
    if (kind === "ai") {
      return enrichCloudArchCosts({
        provider: "aws",
        caption: "想定構成（指示内容からの推定）",
        nodes: [
          { id: "user", service: "users", label: "利用者" },
          { id: "apigw", service: "api-gateway", label: "API" },
          { id: "fn", service: "lambda", label: "処理" },
          { id: "br", service: "bedrock", label: "生成AI" },
          { id: "s3", service: "s3", label: "ストレージ" },
          { id: "os", service: "opensearch", label: "検索" },
          { id: "mon", service: "cloudwatch", label: "監視" },
        ],
        edges: [
          { from: "user", to: "apigw" },
          { from: "apigw", to: "fn" },
          { from: "fn", to: "br" },
          { from: "fn", to: "s3" },
          { from: "fn", to: "os" },
          { from: "fn", to: "mon" },
        ],
      });
    }
    return enrichCloudArchCosts({
      provider: "aws",
      caption: "想定構成（指示内容からの推定）",
      nodes: [
        { id: "cf", service: "cloudfront", label: "配信" },
        { id: "alb", service: "alb", label: "LB" },
        { id: "app", service: "ecs-fargate", label: "アプリ" },
        { id: "db", service: "dynamodb", label: "データ" },
        { id: "sec", service: "secrets-manager", label: "秘密情報" },
        { id: "id", service: "cognito", label: "認証" },
        { id: "mon", service: "cloudwatch", label: "監視" },
      ],
      edges: [
        { from: "cf", to: "alb" },
        { from: "alb", to: "app" },
        { from: "app", to: "db" },
        { from: "app", to: "sec" },
        { from: "id", to: "app", label: "認証" },
        { from: "app", to: "mon" },
      ],
    });
  }

  if (kind === "ai") {
    return enrichCloudArchCosts({
      provider: "azure",
      caption: "想定構成（指示内容からの推定）",
      nodes: [
        { id: "user", service: "users", label: "利用者" },
        { id: "web", service: "app-service", label: "アプリ" },
        { id: "aoai", service: "openai", label: "OpenAI" },
        { id: "search", service: "search", label: "検索" },
        { id: "store", service: "storage", label: "ストレージ" },
        { id: "kv", service: "key-vault", label: "Key Vault" },
        { id: "mon", service: "monitor", label: "監視" },
      ],
      edges: [
        { from: "user", to: "web" },
        { from: "web", to: "aoai" },
        { from: "web", to: "search" },
        { from: "web", to: "store" },
        { from: "web", to: "kv" },
        { from: "web", to: "mon" },
      ],
    });
  }
  return enrichCloudArchCosts({
    provider: "azure",
    caption: "想定構成（指示内容からの推定）",
    nodes: [
      { id: "fd", service: "front-door", label: "入口" },
      { id: "web", service: "app-service", label: "Web/API" },
      { id: "db", service: "cosmos-db", label: "データ" },
      { id: "kv", service: "key-vault", label: "秘密情報" },
      { id: "id", service: "entra-id", label: "認証" },
      { id: "mon", service: "monitor", label: "監視" },
    ],
    edges: [
      { from: "fd", to: "web" },
      { from: "web", to: "db" },
      { from: "web", to: "kv" },
      { from: "id", to: "web", label: "認証" },
      { from: "web", to: "mon" },
    ],
  });
}

/** クラウド依頼なのに構成図が無い場合、想定図を1枚差し込む（空成功禁止） */
export function ensureOutlineCloudArch(outline: DocOutline, userMessage: string): void {
  const hasArch = outline.slides.some(
    (s) => (s.cloudArch ?? s.azureArch)?.nodes.length && (s.cloudArch ?? s.azureArch)!.nodes.length >= 3,
  );
  if (hasArch) return;
  const hay = `${userMessage}\n${outline.documentTitle}`;
  if (!looksLikeCloudRequest(hay)) return;

  const provider: DocCloudProvider = looksLikeAwsRequest(hay) ? "aws" : "azure";
  const kind = /openai|gpt|llm|生成ai|rag|bedrock|認知|\bai\b/i.test(hay)
    ? "ai"
    : "web";
  const arch = defaultCloudArch(provider, kind);
  const label = provider === "aws" ? "AWS" : "Azure";
  const slide: DocSlideOutline = {
    layout: "cloudArch",
    title: `想定 ${label} 構成`,
    keyMessage: "指示内容から推定した構成・費用感",
    bullets: arch.nodes.slice(0, 4).map((n) => `${n.label}（${n.service}）`),
    cloudArch: arch,
  };
  const closingIdx = outline.slides.findIndex((s) => s.layout === "closing");
  if (closingIdx >= 0) outline.slides.splice(closingIdx, 0, slide);
  else outline.slides.push(slide);
}

/** @deprecated use ensureOutlineCloudArch */
export function ensureOutlineAzureArch(outline: DocOutline, userMessage: string): void {
  ensureOutlineCloudArch(outline, userMessage);
}

export function parseDocOutline(raw: unknown): DocOutline | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const documentTitle = String(obj.documentTitle ?? "").trim();
  if (!documentTitle) return null;

  if (!Array.isArray(obj.slides) || !obj.slides.length) return null;

  const slides = obj.slides
    .map(parseSlide)
    .filter((s): s is DocSlideOutline => Boolean(s))
    .slice(0, DOCS_MAX_SLIDES);

  if (!slides.length) return null;

  if (slides[0].layout !== "title") {
    slides.unshift({
      layout: "title",
      title: documentTitle,
      subtitle: obj.subtitle ? String(obj.subtitle).trim() : undefined,
      bullets: [],
    });
  }

  return {
    documentTitle,
    subtitle: obj.subtitle ? String(obj.subtitle).trim() : undefined,
    author: obj.author ? String(obj.author).trim() : undefined,
    slides,
  };
}

export type DocsOutlineAiResult =
  | { ok: true; outline: DocOutline; reply: string; model: string }
  | { ok: false; reason: string };

export async function generateDocOutline(
  userId: string,
  message: string,
  history: DocsChatMessage[] = [],
  previousOutline: DocOutline | null = null,
  attachmentsInput: unknown = null,
): Promise<DocsOutlineAiResult> {
  const trimmed = message.trim();
  if (!trimmed) {
    return { ok: false, reason: "メッセージを入力してください。" };
  }
  if (trimmed.length > 1200) {
    return { ok: false, reason: "メッセージが長すぎます（1200文字以内）。" };
  }

  if (!isAzureOpenAiConfigured()) {
    return {
      ok: false,
      reason: "Azure OpenAI が未設定のため、資料生成は利用できません。",
    };
  }

  const attachmentResult = normalizeAttachments(attachmentsInput);
  if (!attachmentResult.ok) {
    return { ok: false, reason: attachmentResult.reason };
  }
  const attachments = attachmentResult.attachments;

  const quota = await canUseAiTokens(userId);
  if (!quota.allowed) {
    return {
      ok: false,
      reason: `今月の AI 利用上限（${quota.limit.toLocaleString("ja-JP")} tokens）に達しました。`,
    };
  }

  const attachmentBlock = formatAttachmentsForPrompt(attachments);
  const revisionBlock = previousOutline
    ? `\n\n【現在の構成（修正対象）】\n${JSON.stringify(previousOutline, null, 2)}`
    : "";

  const model = defaultStockAiModel();
  const client = getAzureOpenAiClient();

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...trimHistory(history).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    {
      role: "user",
      content: `${trimmed}${attachmentBlock}${revisionBlock}\n\n上記に基づき JSON を出力してください。`,
    },
  ];

  try {
    const completion = await client.chat.completions.create({
      model: getAzureOpenAiDeployment(),
      max_completion_tokens: 2600,
      messages,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) {
      return { ok: false, reason: "AI から構成案がありませんでした。" };
    }

    let parsed: unknown;
    try {
      parsed = extractJson(raw);
    } catch {
      return { ok: false, reason: "AI の出力を JSON として解析できませんでした。" };
    }

    const outline = parseDocOutline(parsed);
    if (!outline) {
      return { ok: false, reason: "構成案の形式が不正です。もう一度お試しください。" };
    }

    ensureOutlineImages(outline);
    ensureOutlineCloudArch(outline, trimmed);

    const modelUsed = completion.model ?? model;
    if (completion.usage) {
      await recordTokenUsage({
        userId,
        feature: "docs-generate",
        model: modelUsed,
        promptTokens: completion.usage.prompt_tokens ?? 0,
        completionTokens: completion.usage.completion_tokens ?? 0,
        requestId: completion.id,
      });
    }

    const reply = previousOutline
      ? `構成を更新しました（${outline.slides.length}枚）。プレビューを確認し、pptx をダウンロードできます。`
      : `内部提案資料の構成を作成しました（${outline.slides.length}枚）。プレビューを確認し、pptx をダウンロードできます。`;

    return { ok: true, outline, reply, model: modelUsed };
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof Error
          ? `資料生成に失敗しました: ${error.message}`
          : "資料生成に失敗しました",
    };
  }
}
