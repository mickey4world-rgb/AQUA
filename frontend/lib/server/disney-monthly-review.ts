/**
 * 的中率が低い月のレビュー → ニュース調査 → 条件の自動追加・見直し
 */
import {
  describeMiss,
  listAccuracyForMonth,
  summarizeLiveAccuracy,
} from "@/lib/server/disney-accuracy";
import {
  loadCrowdAdjustments,
  reasonKeyFromLabel,
  saveCrowdAdjustments,
} from "@/lib/server/disney-crowd-adjustments";
import { COSMOS_CONTAINERS, getContainer, isCosmosConfigured } from "@/lib/server/cosmos";
import { generateWithGoogleSearch } from "@/lib/server/gemini-grounding";
import type { DisneyParkKey } from "@/lib/types/disney";
import type {
  DisneyCrowdAdjustmentRule,
  DisneyMonthlyReviewDoc,
} from "@/lib/types/disney-accuracy";

const HIT_RATE_THRESHOLD = 55;
const MAE_THRESHOLD = 14;
const MIN_REASON_COUNT = 3;
const MAX_NEW_RULES = 4;

function previousMonthKey(fromToday?: string): string {
  const base = fromToday
    ? new Date(`${fromToday}T12:00:00+09:00`)
    : new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  base.setMonth(base.getMonth() - 1);
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}`;
}

function clusterMissReasons(
  records: Awaited<ReturnType<typeof listAccuracyForMonth>>,
): Array<{ reason: string; count: number; avgScoreDelta: number; samples: string[] }> {
  const misses = records.filter((row) => !row.levelHit);
  const map = new Map<
    string,
    { count: number; deltaSum: number; samples: string[] }
  >();

  for (const miss of misses) {
    const reason = miss.factors[0] ?? "要因不明";
    const cur = map.get(reason) ?? { count: 0, deltaSum: 0, samples: [] };
    cur.count += 1;
    cur.deltaSum += miss.scoreDelta;
    if (cur.samples.length < 3) cur.samples.push(describeMiss(miss));
    map.set(reason, cur);
  }

  return [...map.entries()]
    .map(([reason, value]) => ({
      reason,
      count: value.count,
      avgScoreDelta: value.deltaSum / value.count,
      samples: value.samples,
    }))
    .sort((a, b) => b.count - a.count);
}

async function researchCauses(
  month: string,
  clusters: Array<{ reason: string; count: number; samples: string[] }>,
): Promise<string[]> {
  if (clusters.length === 0) return [];

  const top = clusters.slice(0, 5);
  const prompt = [
    `東京ディズニーリゾート（TDL/TDS）の混雑予測がずれた月: ${month}`,
    "外れた要因クラスタ（多い順）:",
    ...top.map(
      (c, i) =>
        `${i + 1}. ${c.reason}（${c.count}回）例: ${c.samples.join(" / ")}`,
    ),
    "",
    "日本のニュース・天候・イベント・チケット施策・競合テーマパーク動向を調べ、",
    "各クラスタの外れの plausibility な理由を日本語で短く列挙してください。",
    "形式: 1行1件「要因名: 理由（根拠の要約）」最大8件。推測でもよいが根拠を明示。",
  ].join("\n");

  const result = await generateWithGoogleSearch({
    system:
      "あなたはテーマパーク来園需要のアナリストです。検索結果に基づき簡潔に日本語で答えてください。",
    userPrompt: prompt,
    timeoutMs: 25_000,
  });

  if (!result.ok) {
    return [`調査スキップ: ${result.reason}`];
  }

  return result.text
    .split("\n")
    .map((line) => line.replace(/^[-*・\d.\s]+/, "").trim())
    .filter((line) => line.length > 8)
    .slice(0, 8);
}

function inferDateWindow(reason: string, month: string): {
  from?: [number, number];
  to?: [number, number];
  daysOfWeek?: number[];
} {
  const m = Number(month.slice(5, 7));
  const lower = reason.toLowerCase();

  if (reason.includes("台風") || reason.includes("豪雨") || reason.includes("災害")) {
    return { from: [8, 20], to: [10, 15] };
  }
  if (reason.includes("ゴールデンウィーク") || reason.includes("GW")) {
    return { from: [4, 29], to: [5, 6] };
  }
  if (reason.includes("夏休み") || reason.includes("お盆")) {
    return { from: [7, 20], to: [8, 31] };
  }
  if (reason.includes("春休み")) {
    return { from: [3, 20], to: [4, 7] };
  }
  if (reason.includes("ハロウィーン") || reason.includes("ハロウィン")) {
    return { from: [10, 1], to: [10, 31] };
  }
  if (reason.includes("土曜日") || reason.includes("日曜日") || reason.includes("週末")) {
    return { from: [m, 1], to: [m, 31], daysOfWeek: [0, 6] };
  }
  if (reason.includes("平日")) {
    return { from: [m, 1], to: [m, 31], daysOfWeek: [1, 2, 3, 4, 5] };
  }
  if (lower.includes("usj") || reason.includes("他園")) {
    return { from: [m, 1], to: [m, 31] };
  }
  // デフォルト: レビュー対象月全体
  return { from: [m, 1], to: [m, 28] };
}

function scoreDeltaFromAvg(avgScoreDelta: number): number {
  // predicted - actual が正 → 過大評価 → 今後は下げたい
  const raw = Math.round(-avgScoreDelta * 0.45);
  return Math.max(-12, Math.min(12, raw === 0 ? (avgScoreDelta > 0 ? -4 : 4) : raw));
}

export async function runMonthlyCrowdReview(options?: {
  month?: string;
  force?: boolean;
}): Promise<DisneyMonthlyReviewDoc> {
  const month = options?.month ?? previousMonthKey();
  const allRecords = await listAccuracyForMonth(month);
  // 経験シードは UI 用暫定。自動条件見直しはライブ実績のみ。
  const records = allRecords.filter((row) => row.actualSource !== "empirical-seed");
  const summary = summarizeLiveAccuracy(allRecords);
  const clusters = clusterMissReasons(records);
  const topMissReasons = clusters.slice(0, 8).map((c) => ({
    reason: c.reason,
    count: c.count,
  }));

  const needsReview =
    options?.force ||
    (summary.evaluatedDays >= 6 &&
      (summary.hitRate < HIT_RATE_THRESHOLD ||
        summary.meanAbsScoreError > MAE_THRESHOLD));

  const newsFindings = needsReview
    ? await researchCauses(month, clusters)
    : ["的中率が基準内のため、条件見直しは見送りました。"];

  const rulesAdded: Array<{ label: string; scoreDelta: number }> = [];
  const rulesUpdated: Array<{ label: string; scoreDelta: number }> = [];

  if (needsReview) {
    const doc = await loadCrowdAdjustments();
    const frequent = clusters.filter((c) => c.count >= MIN_REASON_COUNT).slice(0, MAX_NEW_RULES);

    for (const cluster of frequent) {
      const key = reasonKeyFromLabel(cluster.reason);
      const window = inferDateWindow(cluster.reason, month);
      const delta = scoreDeltaFromAvg(cluster.avgScoreDelta);
      const existing = doc.rules.find((r) => r.reasonKey === key && r.active);

      if (existing) {
        // 同じ理由が再発 → 微調整
        const nextDelta = Math.max(
          -12,
          Math.min(12, Math.round((existing.scoreDelta + delta) / 2)),
        );
        existing.scoreDelta = nextDelta;
        existing.evidenceCount += cluster.count;
        existing.sourceMonth = month;
        existing.note = newsFindings.find((n) => n.includes(cluster.reason.slice(0, 6))) ??
          existing.note;
        rulesUpdated.push({ label: existing.label, scoreDelta: nextDelta });
      } else {
        const rule: DisneyCrowdAdjustmentRule = {
          id: `adj-${key}-${month}`,
          reasonKey: key,
          label: `自動見直: ${cluster.reason}`,
          from: window.from,
          to: window.to,
          daysOfWeek: window.daysOfWeek,
          scoreDelta: delta,
          evidenceCount: cluster.count,
          sourceMonth: month,
          active: true,
          createdAt: new Date().toISOString(),
          note: newsFindings[0],
        };
        doc.rules.push(rule);
        rulesAdded.push({ label: rule.label, scoreDelta: delta });
      }
    }

    // ルール過多を防ぐ（最大24）
    if (doc.rules.filter((r) => r.active).length > 24) {
      const sorted = [...doc.rules].sort(
        (a, b) => a.evidenceCount - b.evidenceCount || a.createdAt.localeCompare(b.createdAt),
      );
      for (const rule of sorted) {
        if (doc.rules.filter((r) => r.active).length <= 24) break;
        if (rule.active && rule.sourceMonth !== month) rule.active = false;
      }
    }

    await saveCrowdAdjustments(doc);
  }

  const summaryText = needsReview
    ? [
        `${month}の的中率は ${summary.hitRate}%（${summary.hits}/${summary.evaluatedDays}日）。`,
        topMissReasons.length
          ? `多い外れ要因: ${topMissReasons
              .slice(0, 3)
              .map((r) => `${r.reason}×${r.count}`)
              .join("、")}。`
          : "",
        rulesAdded.length
          ? `条件追加 ${rulesAdded.length}件（${rulesAdded.map((r) => r.label).join(" / ")}）。`
          : "",
        rulesUpdated.length
          ? `条件見直し ${rulesUpdated.length}件。`
          : rulesAdded.length === 0
            ? "同理由の再発が少なく新規条件は見送り。"
            : "",
      ]
        .filter(Boolean)
        .join(" ")
    : `${month}の的中率は ${summary.hitRate}%（${summary.hits}/${summary.evaluatedDays}日）。基準内のため条件の自動見直しは行いませんでした。`;

  const review: DisneyMonthlyReviewDoc = {
    id: `review-${month}`,
    kind: "crowd-monthly-review",
    month,
    parks: ["tdl", "tds"],
    hitRate: summary.hitRate,
    evaluatedDays: summary.evaluatedDays,
    hits: summary.hits,
    misses: summary.evaluatedDays - summary.hits,
    meanAbsScoreError: summary.meanAbsScoreError,
    topMissReasons,
    newsFindings,
    rulesAdded,
    rulesUpdated,
    summary: summaryText,
    createdAt: new Date().toISOString(),
  };

  if (isCosmosConfigured()) {
    try {
      const container = getContainer(COSMOS_CONTAINERS.disneyRecords);
      await container.items.upsert(review);
    } catch (error) {
      console.warn("[disney-monthly-review] save failed", error);
    }
  }

  return review;
}

export async function getLatestMonthlyReview(): Promise<DisneyMonthlyReviewDoc | null> {
  if (!isCosmosConfigured()) return null;
  try {
    const container = getContainer(COSMOS_CONTAINERS.disneyRecords);
    const { resources } = await container.items
      .query<DisneyMonthlyReviewDoc>({
        query: `
          SELECT TOP 1 * FROM c
          WHERE c.kind = "crowd-monthly-review"
          ORDER BY c.createdAt DESC
        `,
      })
      .fetchAll();
    return resources[0] ?? null;
  } catch {
    return null;
  }
}

export async function getMonthlyReview(month: string): Promise<DisneyMonthlyReviewDoc | null> {
  if (!isCosmosConfigured()) return null;
  try {
    const container = getContainer(COSMOS_CONTAINERS.disneyRecords);
    const { resource } = await container
      .item(`review-${month}`, `review-${month}`)
      .read<DisneyMonthlyReviewDoc>();
    return resource ?? null;
  } catch {
    return null;
  }
}
