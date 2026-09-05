/**
 * 月次レビューで追加された混雑条件の調整ルール
 */
import { parseJstDate } from "@/lib/disney-holidays";
import { getDisneyRecordsContainer, isCosmosConfigured } from "@/lib/server/cosmos";
import type { DisneyParkKey } from "@/lib/types/disney";
import type {
  DisneyCrowdAdjustmentRule,
  DisneyCrowdAdjustmentsDoc,
} from "@/lib/types/disney-accuracy";

const DOC_ID = "crowd-adjustments";
let memoryDoc: DisneyCrowdAdjustmentsDoc | null = null;

function emptyDoc(): DisneyCrowdAdjustmentsDoc {
  return {
    id: DOC_ID,
    kind: "crowd-adjustments",
    rules: [],
    updatedAt: new Date().toISOString(),
  };
}

export async function loadCrowdAdjustments(): Promise<DisneyCrowdAdjustmentsDoc> {
  if (memoryDoc) return memoryDoc;
  if (!isCosmosConfigured()) {
    memoryDoc = emptyDoc();
    return memoryDoc;
  }
  try {
    const container = await getDisneyRecordsContainer();
    const { resource } = await container
      .item(DOC_ID, DOC_ID)
      .read<DisneyCrowdAdjustmentsDoc>();
    memoryDoc = resource ?? emptyDoc();
    return memoryDoc;
  } catch {
    memoryDoc = emptyDoc();
    return memoryDoc;
  }
}

export async function saveCrowdAdjustments(
  doc: DisneyCrowdAdjustmentsDoc,
): Promise<void> {
  doc.updatedAt = new Date().toISOString();
  memoryDoc = doc;
  try {
    const { clearCalendarMonthCache } = await import(
      "@/lib/server/disney-calendar-prediction"
    );
    clearCalendarMonthCache();
  } catch {
    /* ignore */
  }
  if (!isCosmosConfigured()) return;
  try {
    const container = await getDisneyRecordsContainer();
    await container.items.upsert(doc);
  } catch (error) {
    console.warn("[disney-crowd-adjustments] save failed", error);
  }
}

function inMonthDayRange(
  month: number,
  day: number,
  from: [number, number],
  to: [number, number],
): boolean {
  const value = month * 100 + day;
  return value >= from[0] * 100 + from[1] && value <= to[0] * 100 + to[1];
}

/** 日付に適用される調整合計とラベル */
export async function getAdjustmentForDate(
  dateStr: string,
  park: DisneyParkKey,
): Promise<{ delta: number; labels: string[] }> {
  const doc = await loadCrowdAdjustments();
  const { month, day, dayOfWeek } = parseJstDate(dateStr);
  let delta = 0;
  const labels: string[] = [];

  for (const rule of doc.rules) {
    if (!rule.active) continue;
    if (rule.parks && !rule.parks.includes(park)) continue;
    if (rule.from && rule.to && !inMonthDayRange(month, day, rule.from, rule.to)) {
      continue;
    }
    if (rule.daysOfWeek && !rule.daysOfWeek.includes(dayOfWeek)) continue;
    delta += rule.scoreDelta;
    labels.push(rule.label);
  }

  return { delta: Math.max(-20, Math.min(20, delta)), labels };
}

/** 同期版: メモリに載っているルールのみ（breakdown 内で使用） */
export function getCachedAdjustmentForDate(
  dateStr: string,
  park: DisneyParkKey,
): { delta: number; labels: string[] } {
  const doc = memoryDoc ?? emptyDoc();
  const { month, day, dayOfWeek } = parseJstDate(dateStr);
  let delta = 0;
  const labels: string[] = [];

  for (const rule of doc.rules) {
    if (!rule.active) continue;
    if (rule.parks && !rule.parks.includes(park)) continue;
    if (rule.from && rule.to && !inMonthDayRange(month, day, rule.from, rule.to)) {
      continue;
    }
    if (rule.daysOfWeek && !rule.daysOfWeek.includes(dayOfWeek)) continue;
    delta += rule.scoreDelta;
    labels.push(rule.label);
  }

  return { delta: Math.max(-20, Math.min(20, delta)), labels };
}

export function invalidateAdjustmentCache(): void {
  memoryDoc = null;
}

export function reasonKeyFromLabel(label: string): string {
  return label
    .replace(/[（(].*?[）)]/g, "")
    .replace(/\s+/g, "")
    .slice(0, 40);
}
