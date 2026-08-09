/**
 * 訴訟記録の整理・争点抽出チャット（Gemini / Azure OpenAI）。
 * 法的助言ではなく、提出資料の整理に限定する。
 */

import {
  getAzureOpenAiClient,
  getAzureOpenAiDeployment,
  isAzureOpenAiConfigured,
} from "@/lib/server/azure-openai";
import {
  generateWithGemini,
  isGeminiConfigured,
} from "@/lib/server/gemini";
import {
  canUseAiTokens,
  defaultStockAiModel,
  recordTokenUsage,
} from "@/lib/server/token-usage";
import {
  JUDICIAL_DOC_KIND_LABELS,
  type JudicialAiProvider,
  type JudicialCaseChatRequest,
  type JudicialChatMessage,
  type JudicialDocKind,
} from "@/lib/types/judicial-case";

const MAX_HISTORY = 12;
const MAX_MESSAGE_CHARS = 2000;
const MAX_DOC_CHARS_TOTAL = 48_000;
const MAX_DOCS = 20;

const SYSTEM_PROMPT = `あなたは民事訴訟の「訴訟記録を整理する書記官・調査官アシスタント」です。
裁判官が手にする記録（訴状・答弁書・準備書面・書証・証拠説明書・陳述書等）を読み、判断材料を整理します。

## 絶対ルール
- 法的助言・勝敗の断定・依頼者代理の方針決定はしない
- 回答は提出された資料の記載に根拠づける。推測は「資料上は不明／推論」と明示する
- 引用するときは【資料名】と該当箇所（見出しや号証）を示す
- 日本語・です/ます調。結論を先に、続けて根拠
- 争点、事実の認否、時系列、証拠の対応関係、双方に有利・不利な事情を分けて書く
- 800〜1600文字程度を目安。必要なら表形式の箇条書きを使う

## 免責
これは個人学習用の記録整理ツールです。実際の裁判・法律相談の代替にはなりません。`;

export type JudicialCaseChatResult =
  | { ok: true; reply: string; model: string; provider: JudicialAiProvider }
  | { ok: false; reason: string };

function isDocKind(value: unknown): value is JudicialDocKind {
  return typeof value === "string" && value in JUDICIAL_DOC_KIND_LABELS;
}

function normalizeProvider(value: unknown): JudicialAiProvider {
  return value === "openai" ? "openai" : "gemini";
}

function normalizeDocuments(input: JudicialCaseChatRequest["documents"]) {
  if (!Array.isArray(input) || input.length === 0) {
    return { ok: false as const, reason: "分析する資料を1件以上選択してください。" };
  }
  if (input.length > MAX_DOCS) {
    return { ok: false as const, reason: `資料は最大 ${MAX_DOCS} 件までです。` };
  }

  const documents: Array<{
    id: string;
    title: string;
    kind: JudicialDocKind;
    content: string;
  }> = [];

  let used = 0;
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const id = String((raw as { id?: string }).id ?? "").trim();
    const title = String((raw as { title?: string }).title ?? "").trim();
    const kind = (raw as { kind?: unknown }).kind;
    const content = String((raw as { content?: string }).content ?? "").trim();
    if (!id || !title || !isDocKind(kind) || !content) continue;

    const budget = Math.min(content.length, MAX_DOC_CHARS_TOTAL - used);
    if (budget <= 0) break;
    documents.push({
      id,
      title,
      kind,
      content: content.length > budget ? `${content.slice(0, budget)}\n…（省略）` : content,
    });
    used += budget;
  }

  if (documents.length === 0) {
    return { ok: false as const, reason: "有効な資料本文がありません。" };
  }
  return { ok: true as const, documents };
}

function buildCorpus(
  documents: Array<{ title: string; kind: JudicialDocKind; content: string }>,
): string {
  return documents
    .map(
      (doc, index) =>
        `### 資料${index + 1}: ${doc.title}（${JUDICIAL_DOC_KIND_LABELS[doc.kind]}）\n${doc.content}`,
    )
    .join("\n\n");
}

function trimHistory(history: JudicialChatMessage[]): JudicialChatMessage[] {
  return history
    .filter(
      (message) =>
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string" &&
        message.content.trim().length > 0,
    )
    .slice(-MAX_HISTORY)
    .map((message) => ({
      role: message.role,
      content: message.content.slice(0, MAX_MESSAGE_CHARS),
    }));
}

async function chatWithGemini(
  userId: string,
  corpus: string,
  history: JudicialChatMessage[],
  message: string,
): Promise<JudicialCaseChatResult> {
  if (!isGeminiConfigured()) {
    return {
      ok: false,
      reason:
        "Gemini が未設定です。GEMINI_API_KEY または中継（GEMINI_RELAY_URL / GEMINI_RELAY_KEY）を設定してください。",
    };
  }

  const result = await generateWithGemini({
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `【今回の訴訟記録（選択された資料のみ）】\n${corpus}`,
      },
      ...history,
      { role: "user", content: message },
    ],
    maxOutputTokens: 1800,
    temperature: 0.3,
  });

  if (!result.ok) {
    return { ok: false, reason: result.reason };
  }

  await recordTokenUsage({
    userId,
    feature: "judicial-case-chat",
    model: result.model,
    promptTokens: result.promptTokens,
    completionTokens: result.completionTokens,
  });

  return {
    ok: true,
    reply: result.text.trim(),
    model: result.model,
    provider: "gemini",
  };
}

async function chatWithOpenAi(
  userId: string,
  corpus: string,
  history: JudicialChatMessage[],
  message: string,
): Promise<JudicialCaseChatResult> {
  if (!isAzureOpenAiConfigured()) {
    return {
      ok: false,
      reason: "OpenAI（Azure OpenAI）が未設定のため利用できません。",
    };
  }

  const quota = await canUseAiTokens(userId);
  if (!quota.allowed) {
    return {
      ok: false,
      reason: `今月の AI 利用上限（${quota.limit.toLocaleString("ja-JP")} tokens）に達しました。`,
    };
  }

  const model = defaultStockAiModel();
  const client = getAzureOpenAiClient();

  try {
    const completion = await client.chat.completions.create({
      model: getAzureOpenAiDeployment(),
      max_completion_tokens: 1800,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `【今回の訴訟記録（選択された資料のみ）】\n${corpus}`,
        },
        ...history.map((item) => ({
          role: item.role as "user" | "assistant",
          content: item.content,
        })),
        { role: "user", content: message },
      ],
    });

    const reply = completion.choices[0]?.message?.content?.trim();
    if (!reply) {
      return { ok: false, reason: "AI から応答がありませんでした。" };
    }

    const modelUsed = completion.model ?? model;
    if (completion.usage) {
      await recordTokenUsage({
        userId,
        feature: "judicial-case-chat",
        model: modelUsed,
        promptTokens: completion.usage.prompt_tokens ?? 0,
        completionTokens: completion.usage.completion_tokens ?? 0,
        requestId: completion.id,
      });
    }

    return { ok: true, reply, model: modelUsed, provider: "openai" };
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof Error
          ? `OpenAI 応答に失敗しました: ${error.message}`
          : "OpenAI 応答に失敗しました。",
    };
  }
}

export async function sendJudicialCaseChat(
  userId: string,
  request: JudicialCaseChatRequest,
): Promise<JudicialCaseChatResult> {
  const provider = normalizeProvider(request.provider);
  const message = request.message?.trim() ?? "";
  if (!message) {
    return { ok: false, reason: "質問を入力してください。" };
  }
  if (message.length > MAX_MESSAGE_CHARS) {
    return { ok: false, reason: `質問は ${MAX_MESSAGE_CHARS} 文字以内にしてください。` };
  }

  const normalized = normalizeDocuments(request.documents ?? []);
  if (!normalized.ok) {
    return { ok: false, reason: normalized.reason };
  }

  const corpus = buildCorpus(normalized.documents);
  const history = trimHistory(request.history ?? []);

  if (provider === "openai") {
    return chatWithOpenAi(userId, corpus, history, message);
  }
  return chatWithGemini(userId, corpus, history, message);
}

export function getJudicialProvidersStatus() {
  return {
    gemini: isGeminiConfigured(),
    openai: isAzureOpenAiConfigured(),
  };
}
