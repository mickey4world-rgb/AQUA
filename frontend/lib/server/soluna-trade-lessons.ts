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
  "praises": ["良かった点・素晴らしい判断理由（最大4・各60文字以内）。反省がない／良い傾向なら必ず書く"],
  "reflections": ["反省・改善点（最大4・各60文字以内）。問題がなければ空配列可"],
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
    const praises = Array.isArray(parsed.praises)
      ? parsed.praises
          .map((r) => String(r).trim())
          .filter(Boolean)
          .slice(0, 4)
      : [];
    const summary = String(parsed.summary ?? "").trim().slice(0, 48);
    if (!summary && reflections.length === 0 && praises.length === 0) return null;

    const verdict = asVerdict(parsed.verdict);
    const fallbackPraises =
      verdict === "good" && praises.length === 0
        ? ["ルール整合とリスク抑制のバランスが取れた判断"]
        : praises;

    return {
      id: `lesson-${Date.now()}`,
      createdAt: new Date().toISOString(),
      tradeIds: input.trades.map((t) => t.id),
      decisionAction: input.decision.action,
      decisionReason: input.decision.reason.slice(0, 200),
      verdict,
      summary: summary || "評価メモを保存しました",
      reflections,
      praises: fallbackPraises.length ? fallbackPraises : undefined,
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

/** 同じ反省原因が「今月」に複数回出たときだけ対策バイアスを有効化 */
const SAME_CAUSE_MONTH_THRESHOLD = 2;

function jstMonthKey(iso: string): string {
  return new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 7);
}

function causeKeysForLesson(lesson: SolunaTradeLesson): string[] {
  const blob = `${lesson.summary} ${(lesson.reflections ?? []).join(" ")}`;
  const keys = new Set<string>();
  if (lesson.biasHints?.avoidChaseBuys || /追いかけ|焦っ|高値掴|追撃買/.test(blob)) {
    keys.add("avoidChaseBuys");
  }
  if (
    lesson.biasHints?.preferDeferStopLoss ||
    /損切り.*早|含み損.*我慢|長期保有|損切急/.test(blob)
  ) {
    keys.add("preferDeferStopLoss");
  }
  if (
    lesson.biasHints?.preferEarlierTakeProfit ||
    /利確.*遅|伸ばしすぎ|利益確定.*遅/.test(blob)
  ) {
    keys.add("preferEarlierTakeProfit");
  }
  return [...keys];
}

/** 直近レッスンから次回判断用バイアスを合成。同因が月内で複数回のみ対策。 */
export function deriveTradeLessonBias(
  lessons: SolunaTradeLesson[] | undefined,
): TradeLessonBias {
  const month = jstMonthKey(new Date().toISOString());
  const inMonth = (lessons ?? []).filter((l) => jstMonthKey(l.createdAt) === month);
  if (!inMonth.length) {
    return {
      avoidChaseBuys: false,
      preferDeferStopLoss: false,
      preferEarlierTakeProfit: false,
      notes: [],
    };
  }

  const counts: Record<string, number> = {
    avoidChaseBuys: 0,
    preferDeferStopLoss: 0,
    preferEarlierTakeProfit: 0,
  };
  const notes: string[] = [];

  for (const l of inMonth) {
    for (const key of causeKeysForLesson(l)) {
      counts[key] = (counts[key] ?? 0) + 1;
    }
    if (l.verdict === "good" && (l.praises?.length ?? 0) > 0) {
      notes.push(`【良】${l.summary}`);
    } else if (l.verdict !== "good") {
      notes.push(`【${l.verdict}】${l.summary}`);
    }
  }

  const avoidChaseBuys = (counts.avoidChaseBuys ?? 0) >= SAME_CAUSE_MONTH_THRESHOLD;
  const preferDeferStopLoss =
    (counts.preferDeferStopLoss ?? 0) >= SAME_CAUSE_MONTH_THRESHOLD;
  const preferEarlierTakeProfit =
    (counts.preferEarlierTakeProfit ?? 0) >= SAME_CAUSE_MONTH_THRESHOLD;

  const activeNotes: string[] = [];
  if (avoidChaseBuys) {
    activeNotes.push(
      `今月「追いかけ買い」系の反省が ${counts.avoidChaseBuys} 回 → 買い閾値を引き上げ`,
    );
  }
  if (preferDeferStopLoss) {
    activeNotes.push(
      `今月「損切り急ぎ」系の反省が ${counts.preferDeferStopLoss} 回 → 軟損切りを抑制`,
    );
  }
  if (preferEarlierTakeProfit) {
    activeNotes.push(
      `今月「利確遅れ」系の反省が ${counts.preferEarlierTakeProfit} 回 → 利確目安を前倒し`,
    );
  }
  if (!activeNotes.length) {
    activeNotes.push(...notes.filter((n) => n.startsWith("【良】")).slice(-2));
  }

  return {
    avoidChaseBuys,
    preferDeferStopLoss,
    preferEarlierTakeProfit,
    notes: activeNotes.slice(-4),
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
