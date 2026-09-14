/**
 * 売買判断の別モデル AI 評価。
 * ルールエンジンの結果を、会話用とは別系統のモデルで振り返り、
 * 反省点を台帳に蓄積して次回の decideTrade で参考にする。
 */

import {
  getAzureOpenAiClient,
  getAzureOpenAiDeployment,
  isAzureOpenAiConfigured,
} from "@/lib/server/azure-openai";
import { generateWithGemini, isGeminiConfigured } from "@/lib/server/gemini";
import { recordTokenUsage } from "@/lib/server/token-usage";
import type {
  SolunaAssetLedger,
  SolunaTradeLesson,
  SolunaTradeLessonBiasHints,
  SolunaTradeLessonVerdict,
  SolunaTradeRecord,
} from "@/lib/types/soluna";

const MAX_LESSONS = 24;
const SYSTEM_USER_ID = "system";

export type TradeLessonBias = {
  avoidChaseBuys: boolean;
  preferDeferStopLoss: boolean;
  preferEarlierTakeProfit: boolean;
  notes: string[];
};

type DecisionSnapshot = {
  action: "BUY" | "SELL" | "HOLD";
  reason: string;
  ruleIds?: number[];
};

function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("JSON object not found");
  return JSON.parse(candidate.slice(start, end + 1));
}

function asVerdict(value: unknown): SolunaTradeLessonVerdict {
  if (value === "good" || value === "mixed" || value === "bad") return value;
  return "mixed";
}

function asBiasHints(raw: unknown): SolunaTradeLessonBiasHints | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const hints: SolunaTradeLessonBiasHints = {};
  if (typeof o.avoidChaseBuys === "boolean") hints.avoidChaseBuys = o.avoidChaseBuys;
  if (typeof o.preferDeferStopLoss === "boolean") {
    hints.preferDeferStopLoss = o.preferDeferStopLoss;
  }
  if (typeof o.preferEarlierTakeProfit === "boolean") {
    hints.preferEarlierTakeProfit = o.preferEarlierTakeProfit;
  }
  return Object.keys(hints).length ? hints : undefined;
}

function buildPrompt(input: {
  decision: DecisionSnapshot;
  trades: SolunaTradeRecord[];
  ledger: SolunaAssetLedger;
  priorLessons: SolunaTradeLesson[];
}): string {
  const recentLessons = input.priorLessons.slice(-5).map((l) => ({
    verdict: l.verdict,
    summary: l.summary,
    reflections: l.reflections,
    biasHints: l.biasHints,
  }));
  const market = {
    cashYen: input.ledger.cashYen,
    totalYen: input.ledger.totalYen,
    btcPriceYen: input.ledger.btcPriceYen,
    ethPriceYen: input.ledger.ethPriceYen,
    battleMode: input.ledger.battleMode,
    sleepMode: input.ledger.sleepMode,
    monthlyRealizedPnlYen: input.ledger.monthlyRealizedPnlYen,
  };
  return `あなたは暗号資産の少額積立ボットの「独立監査AI」です。
ルールエンジンが出した売買判断を、別視点で評価してください。
賞賛だけでなく、悪かった点・次回への反省を日本語で具体的に書きます。

【今回の判断】
${JSON.stringify(input.decision, null, 2)}

【実行した約定（なければ空）】
${JSON.stringify(
  input.trades.map((t) => ({
    id: t.id,
    side: t.side,
    product: t.product,
    sizeJpy: t.sizeJpy,
    price: t.priceBtc,
    reason: t.reasonDetail ?? t.reason,
    ruleIds: t.ruleIds,
  })),
  null,
  2,
)}

【台帳スナップショット】
${JSON.stringify(market, null, 2)}

【直近の反省メモ（参考）】
${JSON.stringify(recentLessons, null, 2)}

JSON のみで返答:
{
  "verdict": "good" | "mixed" | "bad",
  "summary": "40文字以内の総評",
  "reflections": ["反省または良かった点（最大4・各60文字以内）"],
  "biasHints": {
    "avoidChaseBuys": boolean,
    "preferDeferStopLoss": boolean,
    "preferEarlierTakeProfit": boolean
  }
}`;
}

async function callEvaluatorModel(
  prompt: string,
): Promise<{ text: string; model: string; provider: string; usage?: { prompt: number; completion: number } }> {
  // ルールエンジン＋Soluna会話と系統を分ける: まず Azure OpenAI、だめなら Gemini
  if (isAzureOpenAiConfigured()) {
    const client = getAzureOpenAiClient();
    const deployment = getAzureOpenAiDeployment();
    const completion = await client.chat.completions.create({
      model: deployment,
      max_completion_tokens: 700,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "あなたは売買判断の独立監査AIです。JSONのみを返します。日本語で反省点を明確に。",
        },
        { role: "user", content: prompt },
      ],
    });
    const text = completion.choices[0]?.message?.content?.trim();
    if (!text) throw new Error("empty Azure OpenAI evaluation");
    if (completion.usage) {
      await recordTokenUsage({
        userId: SYSTEM_USER_ID,
        feature: "soluna-trade-review",
        model: completion.model ?? deployment,
        promptTokens: completion.usage.prompt_tokens ?? 0,
        completionTokens: completion.usage.completion_tokens ?? 0,
        requestId: completion.id,
      });
    }
    return {
      text,
      model: completion.model ?? deployment,
      provider: "openai",
      usage: {
        prompt: completion.usage?.prompt_tokens ?? 0,
        completion: completion.usage?.completion_tokens ?? 0,
      },
    };
  }

  if (!isGeminiConfigured()) {
    throw new Error("No evaluator model configured");
  }
  const gemini = await generateWithGemini({
    system:
      "あなたは売買判断の独立監査AIです。JSONのみを返します。日本語で反省点を明確に。",
    messages: [{ role: "user", content: prompt }],
    maxOutputTokens: 700,
    responseMimeType: "application/json",
    temperature: 0.3,
  });
  if (!gemini.ok) throw new Error(gemini.reason);
  await recordTokenUsage({
    userId: SYSTEM_USER_ID,
    feature: "soluna-trade-review",
    model: gemini.model,
    promptTokens: gemini.promptTokens ?? 0,
    completionTokens: gemini.completionTokens ?? 0,
  });
  return {
    text: gemini.text,
    model: gemini.model,
    provider: "gemini",
  };
}

export async function reviewTradeDecision(input: {
  decision: DecisionSnapshot;
  trades: SolunaTradeRecord[];
  ledger: SolunaAssetLedger;
}): Promise<SolunaTradeLesson | null> {
  // HOLD は毎回評価するとコスト増 → BUY/SELL のみ（依頼は判断結果の評価）
  if (input.decision.action === "HOLD") return null;

  try {
    const prior = input.ledger.tradeLessons ?? [];
    const prompt = buildPrompt({
      decision: input.decision,
      trades: input.trades,
      ledger: input.ledger,
      priorLessons: prior,
    });
    const result = await callEvaluatorModel(prompt);
    const parsed = extractJsonObject(result.text) as Record<string, unknown>;
    const reflections = Array.isArray(parsed.reflections)
      ? parsed.reflections
          .map((r) => String(r).trim())
          .filter(Boolean)
          .slice(0, 4)
      : [];
    const summary = String(parsed.summary ?? "").trim().slice(0, 48);
    if (!summary && reflections.length === 0) return null;

    return {
      id: `lesson-${Date.now()}`,
      createdAt: new Date().toISOString(),
      tradeIds: input.trades.map((t) => t.id),
      decisionAction: input.decision.action,
      decisionReason: input.decision.reason.slice(0, 200),
      verdict: asVerdict(parsed.verdict),
      summary: summary || "評価メモを保存しました",
      reflections:
        reflections.length > 0
          ? reflections
          : ["評価本文が短いため、次回も同条件の見直しを推奨"],
      biasHints: asBiasHints(parsed.biasHints),
      model: result.model,
      provider: result.provider,
    };
  } catch (error) {
    console.warn(
      "[trade-lessons] evaluation failed:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

export function appendTradeLesson(
  ledger: SolunaAssetLedger,
  lesson: SolunaTradeLesson | null,
): SolunaAssetLedger {
  if (!lesson) return ledger;
  const next = [...(ledger.tradeLessons ?? []), lesson].slice(-MAX_LESSONS);
  return { ...ledger, tradeLessons: next };
}

/** 直近レッスンから次回判断用バイアスを合成（空成功禁止: notes は見える形で返す） */
export function deriveTradeLessonBias(
  lessons: SolunaTradeLesson[] | undefined,
): TradeLessonBias {
  const recent = (lessons ?? []).slice(-8);
  if (!recent.length) {
    return {
      avoidChaseBuys: false,
      preferDeferStopLoss: false,
      preferEarlierTakeProfit: false,
      notes: [],
    };
  }

  let avoidChase = 0;
  let deferStop = 0;
  let earlierTp = 0;
  const notes: string[] = [];
  for (const l of recent) {
    if (l.biasHints?.avoidChaseBuys || /追いかけ|焦っ|高値/.test(l.summary + l.reflections.join(""))) {
      avoidChase += l.verdict === "bad" ? 2 : 1;
    }
    if (
      l.biasHints?.preferDeferStopLoss ||
      /損切り.*早|含み損.*我慢|長期保有/.test(l.summary + l.reflections.join(""))
    ) {
      deferStop += l.verdict === "bad" ? 2 : 1;
    }
    if (
      l.biasHints?.preferEarlierTakeProfit ||
      /利確.*遅|伸ばしすぎ|利益確定/.test(l.summary + l.reflections.join(""))
    ) {
      earlierTp += l.verdict === "bad" ? 2 : 1;
    }
    if (l.verdict !== "good") {
      notes.push(`【${l.verdict}】${l.summary}`);
    }
  }

  return {
    avoidChaseBuys: avoidChase >= 2,
    preferDeferStopLoss: deferStop >= 2,
    preferEarlierTakeProfit: earlierTp >= 2,
    notes: notes.slice(-4),
  };
}

export function formatLessonNotesForPrompt(bias: TradeLessonBias): string {
  if (!bias.notes.length && !bias.avoidChaseBuys && !bias.preferDeferStopLoss && !bias.preferEarlierTakeProfit) {
    return "";
  }
  const flags = [
    bias.avoidChaseBuys ? "追いかけ買い抑制" : null,
    bias.preferDeferStopLoss ? "損切り猶予優先" : null,
    bias.preferEarlierTakeProfit ? "早め利確検討" : null,
  ].filter(Boolean);
  return [
    flags.length ? `反省バイアス: ${flags.join(" / ")}` : null,
    ...bias.notes.map((n) => `反省メモ: ${n}`),
  ]
    .filter(Boolean)
    .join("｜");
}
