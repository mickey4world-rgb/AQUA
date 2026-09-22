import {
  generateWithGemini,
  isGeminiConfigured,
  stripJsonFence,
} from "@/lib/server/gemini";
import {
  getAzureOpenAiClient,
  getAzureOpenAiDeployment,
  isAzureOpenAiConfigured,
} from "@/lib/server/azure-openai";
import { recordTokenUsage } from "@/lib/server/token-usage";
import type { NewsSearchItem } from "@/lib/types/works-news-search";
import { newsItemNeedsJapaneseTranslation } from "@/lib/works-news-search-lang";

const TRANSLATE_TIMEOUT_MS = 22_000;

export { looksPrimarilyEnglish, newsItemNeedsJapaneseTranslation } from "@/lib/works-news-search-lang";

function approxTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 3));
}

async function translateBatchWithLlm(
  rows: Array<{ index: number; title: string; summary: string }>,
): Promise<
  | { ok: true; map: Map<number, { titleJa: string; summaryJa: string }>; model: string }
  | { ok: false; reason: string }
> {
  if (rows.length === 0) {
    return { ok: true, map: new Map(), model: "none" };
  }

  const system = `あなたはニュース翻訳者です。与えられた英語（または欧文）の見出し・要約を、自然で簡潔な日本語に訳してください。
意訳しすぎず、固有名詞は一般的な日本語表記を優先。捏造・補足説明は禁止。
JSON のみ返す。`;

  const userPrompt = `次の記事を日本語訳してください。
${JSON.stringify(rows, null, 2)}

JSON:
{ "items": [ { "index": 0, "titleJa": "...", "summaryJa": "..." } ] }`;

  let text = "";
  let model = "";

  if (isGeminiConfigured()) {
    const local = await generateWithGemini(
      {
        system,
        messages: [{ role: "user", content: userPrompt }],
        maxOutputTokens: 3072,
        temperature: 0.1,
        responseMimeType: "application/json",
      },
      { timeoutMs: TRANSLATE_TIMEOUT_MS, maxAttempts: 2 },
    );
    if (local.ok) {
      text = local.text;
      model = local.model;
    }
  }

  if (!text && isAzureOpenAiConfigured()) {
    try {
      const client = getAzureOpenAiClient();
      const deployment = getAzureOpenAiDeployment();
      const completion = await client.chat.completions.create({
        model: deployment,
        max_completion_tokens: 3072,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: userPrompt },
        ],
      });
      text = completion.choices[0]?.message?.content?.trim() ?? "";
      model = completion.model ?? deployment;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return { ok: false, reason: `Azure OpenAI: ${reason}` };
    }
  }

  if (!text) {
    return { ok: false, reason: "翻訳用 LLM が未設定または応答なし" };
  }

  try {
    await recordTokenUsage({
      userId: "__works-news-search__",
      feature: "works-news-search-translate",
      model,
      promptTokens: approxTokens(userPrompt),
      completionTokens: approxTokens(text),
    });
  } catch {
    /* best-effort */
  }

  try {
    const parsed = JSON.parse(stripJsonFence(text)) as {
      items?: Array<Record<string, unknown>>;
    };
    const map = new Map<number, { titleJa: string; summaryJa: string }>();
    for (const row of parsed.items ?? []) {
      const index = typeof row.index === "number" ? row.index : -1;
      const titleJa = typeof row.titleJa === "string" ? row.titleJa.trim() : "";
      const summaryJa = typeof row.summaryJa === "string" ? row.summaryJa.trim() : "";
      if (index < 0 || (!titleJa && !summaryJa)) continue;
      map.set(index, { titleJa, summaryJa });
    }
    return { ok: true, map, model };
  } catch {
    return { ok: false, reason: "翻訳 JSON の解析に失敗" };
  }
}

/**
 * 英語記事に titleJa / summaryJa を付与。失敗しても原文のまま返す（収集自体は成功扱い）。
 */
export async function ensureJapaneseTranslations(
  items: NewsSearchItem[],
): Promise<{ items: NewsSearchItem[]; translated: number; reason?: string }> {
  const needIdx: number[] = [];
  items.forEach((item, index) => {
    if (newsItemNeedsJapaneseTranslation(item)) needIdx.push(index);
  });
  if (needIdx.length === 0) {
    return { items, translated: 0 };
  }

  const rows = needIdx.map((index) => ({
    index,
    title: items[index].title,
    summary: items[index].summary,
  }));

  const result = await translateBatchWithLlm(rows);
  if (!result.ok) {
    return { items, translated: 0, reason: result.reason };
  }

  let translated = 0;
  const next = items.map((item, index) => {
    const ja = result.map.get(index);
    if (!ja) return item;
    translated += 1;
    return {
      ...item,
      titleJa: ja.titleJa || item.titleJa,
      summaryJa: ja.summaryJa || item.summaryJa || ja.titleJa,
    };
  });
  return { items: next, translated };
}
