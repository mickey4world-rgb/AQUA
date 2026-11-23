import {
  buildLifeProximityFromFlows,
  normalizeCityInput,
  normalizePrefectureInput,
  type LifeProximityFlowInput,
  type LifeProximityQuery,
  type LifeProximityResult,
} from "@/lib/gyosei-life-proximity";
import { listGyoseiYears, loadGyoseiYear } from "@/lib/server/gyosei-data";
import { splitWorkAndAddress } from "@/lib/server/company-address";

const CACHE_TTL_MS = 60 * 60 * 1000;
const resultCache = new Map<string, { builtAt: number; result: LifeProximityResult }>();

function cacheKey(year: number, prefecture: string, city: string | null): string {
  return `${year}|${prefecture}|${city ?? ""}`;
}

export function queryLifeProximity(input: {
  year?: number | null;
  prefecture: string;
  city?: string | null;
}): LifeProximityResult | { error: string; status: number } {
  const prefecture = normalizePrefectureInput(input.prefecture);
  if (!prefecture) {
    return { error: "都道府県を選択してください（例: 東京都）", status: 400 };
  }
  const city = normalizeCityInput(input.city);
  const years = listGyoseiYears();
  const year =
    input.year && years.includes(input.year) ? input.year : years[years.length - 1];
  if (!year) {
    return { error: "行政事業レビューのデータ年度がありません", status: 503 };
  }

  const key = cacheKey(year, prefecture, city);
  const cached = resultCache.get(key);
  if (cached && Date.now() - cached.builtAt < CACHE_TTL_MS) {
    return cached.result;
  }

  const dataset = loadGyoseiYear(year);
  if (!dataset) {
    return { error: `${year}年度のデータが読み込めません`, status: 503 };
  }

  const flows: LifeProximityFlowInput[] = [];
  for (const flow of dataset.flows) {
    const [projectIndex, payeeIndex, amount, , , , rawWork] = flow;
    const project = dataset.projects[projectIndex];
    if (!project) continue;
    const payee = dataset.dictionaries.payees[payeeIndex] ?? "";
    const { address } = splitWorkAndAddress(rawWork || "");
    flows.push({
      payee,
      project: project[1],
      ministry: dataset.dictionaries.ministries[project[0]] ?? "",
      amount,
      address: address || null,
    });
  }

  const query: LifeProximityQuery = { prefecture, city };
  const result = buildLifeProximityFromFlows(flows, query, {
    year,
    unit: dataset.unit,
    sourceLabel: dataset.source.label,
  });

  resultCache.set(key, { builtAt: Date.now(), result });
  return result;
}
