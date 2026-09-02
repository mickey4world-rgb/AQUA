import {
  listGyoseiYears,
  queryMoneyFlow,
} from "@/lib/server/gyosei-data";
import type { MoneyFlowResponse } from "@/lib/types/gyosei";

const MEMORY_TTL_MS = 55 * 60 * 1000;

let memoryCache: { year: number; snapshot: MoneyFlowResponse; builtAt: number } | null =
  null;
let buildPromise: Promise<MoneyFlowResponse> | null = null;

async function buildFreshSnapshot(): Promise<MoneyFlowResponse> {
  const years = listGyoseiYears();
  const year = years[years.length - 1] ?? years[0];
  const snapshot = await queryMoneyFlow({
    year,
    limit: 40,
    rowMode: "detail",
  });
  memoryCache = { year, snapshot, builtAt: Date.now() };
  return snapshot;
}

/** 公開プレビュー用（同梱 CSV のみ・AI コストなし） */
export async function getWorksMoneyFlowPublicPreview(options: {
  force?: boolean;
} = {}): Promise<MoneyFlowResponse> {
  const years = listGyoseiYears();
  const year = years[years.length - 1] ?? years[0];

  if (
    !options.force &&
    memoryCache?.year === year &&
    Date.now() - memoryCache.builtAt < MEMORY_TTL_MS
  ) {
    return memoryCache.snapshot;
  }

  if (!buildPromise) {
    buildPromise = buildFreshSnapshot()
      .catch((error) => {
        memoryCache = null;
        throw error;
      })
      .finally(() => {
        buildPromise = null;
      });
  }
  return buildPromise;
}
