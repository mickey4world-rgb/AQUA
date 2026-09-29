/**
 * 日本株自動運用 — 監査AI（Soluna trade-lessons と同型）
 * dry-run / LIVE 後に良い点・反省を蓄積。同因が月内2回以上でバイアス／条件候補に昇格。
 */
import { randomUUID } from "crypto";
import { CosmosClient, type Container } from "@azure/cosmos";
import { COSMOS_CONTAINERS } from "@/lib/server/cosmos";
import { STOCK_AUDIT_PROMOTE_THRESHOLD } from "@/lib/stock-trade-constants";
import type { StockBrokerOrderRecord } from "@/lib/types/stock-broker-trade";

export type StockTradeLessonVerdict = "good" | "mixed" | "poor";

export interface StockTradeLesson {
  id: string;
  userId: string;
  orderId: string;
  side: "buy" | "sell";
  symbol: string;
  verdict: StockTradeLessonVerdict;
  summary: string;
  praises: string[];
  reflections: string[];
  biasHints?: {
    avoidChaseBuys?: boolean;
    preferEarlierTakeProfit?: boolean;
    preferDeferStopLoss?: boolean;
  };
  provider?: string;
  createdAt: string;
}

export interface StockTradeLessonBias {
  avoidChaseBuys: boolean;
  preferDeferStopLoss: boolean;
  preferEarlierTakeProfit: boolean;
  notes: string[];
  /** 月内で閾値超えしたテーマ → UI 条件候補 */
  promotedRules: Array<{ title: string; summary: string; count: number }>;
}

interface StockLedgerDoc {
  id: string;
  userId: string;
  tradeLessons: StockTradeLesson[];
  updatedAt: string;
}

const MAX_LESSONS = 40;
let ledgerContainerCache: Container | null = null;

async function ledgerContainer(): Promise<Container> {
  if (ledgerContainerCache) return ledgerContainerCache;
  const endpoint = process.env.COSMOS_ENDPOINT;
  const key = process.env.COSMOS_KEY;
  const databaseId = process.env.COSMOS_DATABASE ?? "personal-apps";
  if (!endpoint || !key) {
    throw new Error("COSMOS_ENDPOINT and COSMOS_KEY must be configured");
  }
  const client = new CosmosClient({ endpoint, key });
  const { database } = await client.databases.createIfNotExists({
    id: databaseId,
  });
  const { container } = await database.containers.createIfNotExists({
    id: COSMOS_CONTAINERS.stockBroker,
    partitionKey: { paths: ["/userId"] },
  });
  ledgerContainerCache = container;
  return container;
}

function ledgerId(userId: string) {
  return `stock-ledger-${userId}`;
}

async function loadLedger(userId: string): Promise<StockLedgerDoc> {
  try {
    const { resource } = await (
      await ledgerContainer()
    ).item(ledgerId(userId), userId).read<StockLedgerDoc>();
    if (resource) return resource;
  } catch {
    /* create */
  }
  return {
    id: ledgerId(userId),
    userId,
    tradeLessons: [],
    updatedAt: new Date().toISOString(),
  };
}

async function saveLedger(doc: StockLedgerDoc): Promise<void> {
  await (await ledgerContainer()).items.upsert({
    ...doc,
    updatedAt: new Date().toISOString(),
  });
}

function heuristicLesson(order: StockBrokerOrderRecord): StockTradeLesson {
  const dry = order.dryRun || order.status === "dry_run";
  const praises: string[] = [];
  const reflections: string[] = [];
  let verdict: StockTradeLessonVerdict = "mixed";
  const biasHints: StockTradeLesson["biasHints"] = {};

  if (order.side === "sell") {
    praises.push("保有がある銘柄のみ売るルールを守っている");
    if (dry) praises.push("dry-run で実市場と照合しながら検証できている");
    if ((order.realizedPnlYen ?? 0) > 0) {
      praises.push("売りでプラスの実現益概算");
      verdict = "good";
    } else if ((order.realizedPnlYen ?? 0) < 0) {
      reflections.push("含み損での売り — 利確タイミングの前倒しを検討");
      biasHints.preferEarlierTakeProfit = true;
      verdict = "mixed";
    }
  } else {
    praises.push("買い条件（単元・余力）を通過した候補");
    if (dry) praises.push("検証モードのため実発注なし");
    reflections.push("高値追いは避け、押し目を優先する");
    biasHints.avoidChaseBuys = true;
    verdict = "mixed";
  }

  return {
    id: randomUUID(),
    userId: order.userId,
    orderId: order.id,
    side: order.side,
    symbol: order.symbol,
    verdict,
    summary:
      order.side === "sell"
        ? `${order.symbol} 売り ${dry ? "dry-run" : "LIVE"} を監査`
        : `${order.symbol} 買い ${dry ? "dry-run" : "LIVE"} を監査`,
    praises,
    reflections,
    biasHints,
    provider: "heuristic",
    createdAt: new Date().toISOString(),
  };
}

/** OpenAI があれば監査、無ければヒューリスティック */
async function runAuditModel(
  order: StockBrokerOrderRecord,
): Promise<StockTradeLesson | null> {
  const key = process.env.OPENAI_API_KEY ?? process.env.AZURE_OPENAI_API_KEY;
  if (!key) return null;

  const endpoint =
    process.env.AZURE_OPENAI_ENDPOINT?.replace(/\/$/, "") ??
    "https://api.openai.com/v1";
  const deployment =
    process.env.AZURE_OPENAI_DEPLOYMENT ??
    process.env.OPENAI_MODEL ??
    "gpt-4o-mini";
  const isAzure = Boolean(process.env.AZURE_OPENAI_ENDPOINT);
  const url = isAzure
    ? `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=2024-02-15-preview`
    : `${endpoint}/chat/completions`;

  const prompt = `あなたは日本株・少額自動売買の独立監査AIです。JSONのみ返してください。
注文: side=${order.side} symbol=${order.symbol} qty=${order.qty} status=${order.status} dryRun=${order.dryRun} reason=${order.reason}
{
  "verdict": "good"|"mixed"|"poor",
  "summary": "40文字以内",
  "praises": ["良い点 最大3"],
  "reflections": ["反省 最大3"],
  "biasHints": {
    "avoidChaseBuys": false,
    "preferEarlierTakeProfit": false,
    "preferDeferStopLoss": false
  }
}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(isAzure
          ? { "api-key": key }
          : { Authorization: `Bearer ${key}` }),
      },
      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content: "独立監査AI。JSONのみ。日本語で良い点と反省を明確に。",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 500,
      }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = body.choices?.[0]?.message?.content ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as {
      verdict?: StockTradeLessonVerdict;
      summary?: string;
      praises?: string[];
      reflections?: string[];
      biasHints?: StockTradeLesson["biasHints"];
    };
    return {
      id: randomUUID(),
      userId: order.userId,
      orderId: order.id,
      side: order.side,
      symbol: order.symbol,
      verdict: parsed.verdict ?? "mixed",
      summary: (parsed.summary ?? "監査").slice(0, 80),
      praises: (parsed.praises ?? []).slice(0, 4),
      reflections: (parsed.reflections ?? []).slice(0, 4),
      biasHints: parsed.biasHints,
      provider: isAzure ? `azure:${deployment}` : deployment,
      createdAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export async function recordStockTradeLessonForOrder(
  order: StockBrokerOrderRecord,
): Promise<StockTradeLesson> {
  const lesson =
    (await runAuditModel(order).catch(() => null)) ?? heuristicLesson(order);
  const ledger = await loadLedger(order.userId);
  const next = [...(ledger.tradeLessons ?? []), lesson].slice(-MAX_LESSONS);
  await saveLedger({ ...ledger, tradeLessons: next });
  return lesson;
}

export async function listStockTradeLessons(
  userId: string,
  limit = 8,
): Promise<StockTradeLesson[]> {
  const ledger = await loadLedger(userId);
  return [...(ledger.tradeLessons ?? [])]
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .slice(0, limit);
}

function jstMonthKey(iso: string): string {
  return new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 7);
}

function causeKeys(lesson: StockTradeLesson): string[] {
  const blob = `${lesson.summary} ${(lesson.reflections ?? []).join(" ")} ${(lesson.praises ?? []).join(" ")}`;
  const keys = new Set<string>();
  if (lesson.biasHints?.avoidChaseBuys || /追いかけ|高値|追撃買/.test(blob)) {
    keys.add("avoidChaseBuys");
  }
  if (
    lesson.biasHints?.preferEarlierTakeProfit ||
    /利確.*遅|伸ばしすぎ/.test(blob)
  ) {
    keys.add("preferEarlierTakeProfit");
  }
  if (
    lesson.biasHints?.preferDeferStopLoss ||
    /損切り.*早|損切急/.test(blob)
  ) {
    keys.add("preferDeferStopLoss");
  }
  if (lesson.verdict === "good" && /dry-run|検証|ルール/.test(blob)) {
    keys.add("keepDryRunDiscipline");
  }
  return [...keys];
}

export async function getStockTradeLessonBias(
  userId: string,
): Promise<StockTradeLessonBias> {
  const lessons = await listStockTradeLessons(userId, 40);
  const month = jstMonthKey(new Date().toISOString());
  const inMonth = lessons.filter((l) => jstMonthKey(l.createdAt) === month);
  const empty: StockTradeLessonBias = {
    avoidChaseBuys: false,
    preferDeferStopLoss: false,
    preferEarlierTakeProfit: false,
    notes: [],
    promotedRules: [],
  };
  if (!inMonth.length) return empty;

  const counts: Record<string, number> = {};
  for (const l of inMonth) {
    for (const k of causeKeys(l)) counts[k] = (counts[k] ?? 0) + 1;
  }

  const threshold = STOCK_AUDIT_PROMOTE_THRESHOLD;
  const avoidChaseBuys = (counts.avoidChaseBuys ?? 0) >= threshold;
  const preferDeferStopLoss = (counts.preferDeferStopLoss ?? 0) >= threshold;
  const preferEarlierTakeProfit =
    (counts.preferEarlierTakeProfit ?? 0) >= threshold;

  const promotedRules: StockTradeLessonBias["promotedRules"] = [];
  if (avoidChaseBuys) {
    promotedRules.push({
      title: "追いかけ買い抑制（監査昇格）",
      summary: `今月「追いかけ買い」系の指摘が ${counts.avoidChaseBuys} 回 → 急騰銘柄の買いを抑制`,
      count: counts.avoidChaseBuys!,
    });
  }
  if (preferEarlierTakeProfit) {
    promotedRules.push({
      title: "利確前倒し（監査昇格）",
      summary: `今月「利確遅れ」系の指摘が ${counts.preferEarlierTakeProfit} 回 → 目標手前でも売り検討を強める`,
      count: counts.preferEarlierTakeProfit!,
    });
  }
  if (preferDeferStopLoss) {
    promotedRules.push({
      title: "損切り猶予（監査昇格）",
      summary: `今月「損切り急ぎ」系の指摘が ${counts.preferDeferStopLoss} 回 → 軟損切りを抑制`,
      count: counts.preferDeferStopLoss!,
    });
  }
  if ((counts.keepDryRunDiscipline ?? 0) >= threshold) {
    promotedRules.push({
      title: "検証規律の維持（監査昇格）",
      summary: `良い点「dry-run/ルール遵守」が ${counts.keepDryRunDiscipline} 回続いた → 検証モードを継続推奨`,
      count: counts.keepDryRunDiscipline!,
    });
  }

  const notes = [
    ...promotedRules.map((r) => r.summary),
    ...inMonth
      .filter((l) => l.verdict === "good")
      .slice(0, 2)
      .map((l) => `【良】${l.summary}`),
  ].slice(0, 6);

  return {
    avoidChaseBuys,
    preferDeferStopLoss,
    preferEarlierTakeProfit,
    notes,
    promotedRules,
  };
}
