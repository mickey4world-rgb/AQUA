import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import path from "node:path";
import type {
  GyoseiSummary,
  GyoseiYearDataset,
  MoneyFlowFilters,
  MoneyFlowLink,
  MoneyFlowNode,
  MoneyFlowResponse,
} from "@/lib/types/gyosei";

const DATA_DIR = path.join(process.cwd(), "data", "gyosei");
const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 80;
const MAX_ROWS = 120;

let summaryCache: GyoseiSummary | null = null;
const yearCache = new Map<number, GyoseiYearDataset>();

export function loadGyoseiSummary(): GyoseiSummary {
  if (!summaryCache) {
    summaryCache = JSON.parse(
      readFileSync(path.join(DATA_DIR, "summary.json"), "utf8"),
    ) as GyoseiSummary;
  }
  return summaryCache;
}

export function listGyoseiYears(): number[] {
  return loadGyoseiSummary().years.map((year) => year.fiscalYear);
}

export function loadGyoseiYear(year: number): GyoseiYearDataset {
  const cached = yearCache.get(year);
  if (cached) return cached;

  const buffer = readFileSync(path.join(DATA_DIR, `fy${year}.json.gz`));
  const dataset = JSON.parse(gunzipSync(buffer).toString("utf8")) as GyoseiYearDataset;
  yearCache.set(year, dataset);
  return dataset;
}

export function queryMoneyFlow(filters: MoneyFlowFilters): MoneyFlowResponse {
  const summary = loadGyoseiSummary();
  const availableYears = summary.years.map((year) => year.fiscalYear);
  const year = availableYears.includes(filters.year)
    ? filters.year
    : availableYears[availableYears.length - 1];

  const dataset = loadGyoseiYear(year);
  const ministryFilter = filters.ministry?.trim() || null;
  const payeeFilter = normalizePayeeQuery(filters.payee);
  const limit = clamp(filters.limit ?? DEFAULT_LIMIT, 8, MAX_LIMIT);

  const ministryIndex =
    ministryFilter === null
      ? null
      : dataset.dictionaries.ministries.findIndex((name) => name === ministryFilter);

  const matchingFlowIndexes: number[] = [];
  let totalAmount = 0;
  const projectSet = new Set<number>();
  const payeeSet = new Set<number>();

  for (let i = 0; i < dataset.flows.length; i += 1) {
    const [projectIndex, payeeIndex, amount] = dataset.flows[i];
    const project = dataset.projects[projectIndex];
    if (project[6]) continue; // 単位が疑わしい事業は除外

    if (ministryIndex !== null && project[0] !== ministryIndex) continue;

    const payeeName = dataset.dictionaries.payees[payeeIndex];
    if (payeeFilter && !normalizePayeeQuery(payeeName).includes(payeeFilter)) continue;

    matchingFlowIndexes.push(i);
    totalAmount += amount;
    projectSet.add(projectIndex);
    payeeSet.add(payeeIndex);
  }

  const graph = buildGraph({
    dataset,
    matchingFlowIndexes,
    ministryFilter,
    payeeFilter,
    limit,
  });

  const rows = matchingFlowIndexes
    .slice()
    .sort((a, b) => dataset.flows[b][2] - dataset.flows[a][2])
    .slice(0, MAX_ROWS)
    .map((index) => {
      const [projectIndex, payeeIndex, amount, block, contractIndex, , work] =
        dataset.flows[index];
      const project = dataset.projects[projectIndex];
      return {
        ministry: dataset.dictionaries.ministries[project[0]],
        project: project[1],
        projectNumber: project[5],
        payee: dataset.dictionaries.payees[payeeIndex],
        amount,
        block,
        contract:
          contractIndex >= 0 ? dataset.dictionaries.contracts[contractIndex] : null,
        work,
      };
    });

  return {
    year,
    unit: dataset.unit,
    filters: {
      ministry: ministryFilter,
      payee: filters.payee?.trim() || null,
    },
    totals: {
      amount: round1(totalAmount),
      projectCount: projectSet.size,
      payeeCount: payeeSet.size,
      flowCount: matchingFlowIndexes.length,
      truncated: graph.truncated,
    },
    nodes: graph.nodes,
    links: graph.links,
    rows,
    source: dataset.source,
    availableYears,
    ministries: [...dataset.dictionaries.ministries].sort((a, b) =>
      a.localeCompare(b, "ja"),
    ),
  };
}

function buildGraph(args: {
  dataset: GyoseiYearDataset;
  matchingFlowIndexes: number[];
  ministryFilter: string | null;
  payeeFilter: string | null;
  limit: number;
}): { nodes: MoneyFlowNode[]; links: MoneyFlowLink[]; truncated: boolean } {
  const { dataset, matchingFlowIndexes, ministryFilter, payeeFilter, limit } = args;

  // 政府全体 → 府省庁 → 事業 → 支出先 の 4 層。絞り込みが強いほど中間層を省略せず見せる。
  const ministryTotals = new Map<number, number>();
  const projectTotals = new Map<number, number>();
  const payeeTotals = new Map<number, number>();
  const ministryToProject = new Map<string, number>();
  const projectToPayee = new Map<string, number>();

  for (const index of matchingFlowIndexes) {
    const [projectIndex, payeeIndex, amount] = dataset.flows[index];
    const project = dataset.projects[projectIndex];
    const ministryIndex = project[0];

    ministryTotals.set(ministryIndex, (ministryTotals.get(ministryIndex) ?? 0) + amount);
    projectTotals.set(projectIndex, (projectTotals.get(projectIndex) ?? 0) + amount);
    payeeTotals.set(payeeIndex, (payeeTotals.get(payeeIndex) ?? 0) + amount);

    const mp = `${ministryIndex}>${projectIndex}`;
    ministryToProject.set(mp, (ministryToProject.get(mp) ?? 0) + amount);

    const pp = `${projectIndex}>${payeeIndex}`;
    projectToPayee.set(pp, (projectToPayee.get(pp) ?? 0) + amount);
  }

  const topMinistries = topKeys(ministryTotals, ministryFilter ? 1 : Math.min(limit, 14));
  const topProjects = topKeys(
    projectTotals,
    ministryFilter || payeeFilter ? Math.min(limit, 24) : Math.min(limit, 18),
  );
  const topPayees = topKeys(payeeTotals, Math.min(limit, 24));

  const ministrySet = new Set(topMinistries);
  const projectSet = new Set(topProjects);
  const payeeSet = new Set(topPayees);

  const nodes: MoneyFlowNode[] = [];
  const links: MoneyFlowLink[] = [];
  const nodeIds = new Set<string>();

  const addNode = (node: MoneyFlowNode) => {
    if (nodeIds.has(node.id)) return;
    nodeIds.add(node.id);
    nodes.push(node);
  };

  const governmentAmount = [...ministryTotals.values()].reduce((sum, value) => sum + value, 0);
  addNode({
    id: "gov",
    label: "政府全体",
    kind: "government",
    amount: round1(governmentAmount),
  });

  for (const ministryIndex of topMinistries) {
    const amount = ministryTotals.get(ministryIndex) ?? 0;
    const id = `m:${ministryIndex}`;
    addNode({
      id,
      label: dataset.dictionaries.ministries[ministryIndex],
      kind: "ministry",
      amount: round1(amount),
    });
    links.push({ source: "gov", target: id, amount: round1(amount) });
  }

  for (const projectIndex of topProjects) {
    const project = dataset.projects[projectIndex];
    if (!ministrySet.has(project[0])) continue;
    const amount = projectTotals.get(projectIndex) ?? 0;
    const id = `p:${projectIndex}`;
    addNode({
      id,
      label: truncate(project[1], 28),
      kind: "project",
      amount: round1(amount),
    });
    links.push({
      source: `m:${project[0]}`,
      target: id,
      amount: round1(ministryToProject.get(`${project[0]}>${projectIndex}`) ?? amount),
    });
  }

  for (const [key, amount] of projectToPayee) {
    const [projectIndexText, payeeIndexText] = key.split(">");
    const projectIndex = Number(projectIndexText);
    const payeeIndex = Number(payeeIndexText);
    if (!projectSet.has(projectIndex) || !payeeSet.has(payeeIndex)) continue;
    if (!ministrySet.has(dataset.projects[projectIndex][0])) continue;

    const payeeId = `c:${payeeIndex}`;
    addNode({
      id: payeeId,
      label: truncate(dataset.dictionaries.payees[payeeIndex], 24),
      kind: "payee",
      amount: round1(payeeTotals.get(payeeIndex) ?? 0),
    });
    links.push({
      source: `p:${projectIndex}`,
      target: payeeId,
      amount: round1(amount),
    });
  }

  // 府省庁だけ絞って事業が薄い場合でも、支出先が残るように府省庁→支出先の直結も足す。
  if (links.filter((link) => link.target.startsWith("c:")).length < 4) {
    const ministryToPayee = new Map<string, number>();
    for (const index of matchingFlowIndexes) {
      const [projectIndex, payeeIndex, amount] = dataset.flows[index];
      const ministryIndex = dataset.projects[projectIndex][0];
      if (!ministrySet.has(ministryIndex) || !payeeSet.has(payeeIndex)) continue;
      const key = `${ministryIndex}>${payeeIndex}`;
      ministryToPayee.set(key, (ministryToPayee.get(key) ?? 0) + amount);
    }
    for (const [key, amount] of ministryToPayee) {
      const [ministryIndexText, payeeIndexText] = key.split(">");
      const payeeId = `c:${payeeIndexText}`;
      addNode({
        id: payeeId,
        label: truncate(dataset.dictionaries.payees[Number(payeeIndexText)], 24),
        kind: "payee",
        amount: round1(payeeTotals.get(Number(payeeIndexText)) ?? 0),
      });
      links.push({
        source: `m:${ministryIndexText}`,
        target: payeeId,
        amount: round1(amount),
      });
    }
  }

  const truncated =
    ministryTotals.size > topMinistries.length ||
    projectTotals.size > topProjects.length ||
    payeeTotals.size > topPayees.length;

  return {
    nodes: nodes.map((node) => ({ ...node, amount: round1(node.amount) })),
    links: links.filter((link) => link.amount > 0),
    truncated,
  };
}

function topKeys(map: Map<number, number>, limit: number): number[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key]) => key);
}

function normalizePayeeQuery(value?: string | null): string {
  return (value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/株式会社|有限会社|合同会社|\(株\)|（株）|\s+/g, "");
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
