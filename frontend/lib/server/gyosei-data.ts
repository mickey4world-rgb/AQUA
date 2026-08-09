import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { PAYEE_SECTORS, matchSector } from "@/lib/gyosei-sectors";
import {
  isHoujinConfigured,
  parseJapanAddress,
  searchHoujinByName,
} from "@/lib/server/houjin";
import type {
  GyoseiSummary,
  GyoseiYearDataset,
  MoneyFlowFilters,
  MoneyFlowLink,
  MoneyFlowNode,
  MoneyFlowResponse,
  NearbyMunicipalPayee,
} from "@/lib/types/gyosei";

const DATA_DIR = path.join(process.cwd(), "data", "gyosei");
const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 80;
const MAX_ROWS = 120;
/** 主要事項DBに無い直近年度。見える化サイト CSV を取り込めば有効化される。 */
const PENDING_YEARS = [2023, 2024, 2025];

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

export function listPendingGyoseiYears(): number[] {
  const loaded = new Set(listGyoseiYears());
  return PENDING_YEARS.filter((year) => !loaded.has(year) && !yearFileExists(year));
}

function yearFileExists(year: number): boolean {
  return existsSync(path.join(DATA_DIR, `fy${year}.json.gz`));
}

export function loadGyoseiYear(year: number): GyoseiYearDataset | null {
  if (!yearFileExists(year)) return null;
  const cached = yearCache.get(year);
  if (cached) return cached;

  const buffer = readFileSync(path.join(DATA_DIR, `fy${year}.json.gz`));
  const dataset = JSON.parse(gunzipSync(buffer).toString("utf8")) as GyoseiYearDataset;
  yearCache.set(year, dataset);
  return dataset;
}

export async function queryMoneyFlow(
  filters: MoneyFlowFilters,
): Promise<MoneyFlowResponse> {
  const summary = loadGyoseiSummary();
  const availableYears = [
    ...new Set([...listGyoseiYears(), ...PENDING_YEARS.filter(yearFileExists)]),
  ].sort((a, b) => a - b);
  const pendingYears = listPendingGyoseiYears();
  const year = Number.isFinite(filters.year) ? filters.year : availableYears.at(-1)!;
  const sectors = PAYEE_SECTORS.map((sector) => ({
    id: sector.id,
    label: sector.label,
  }));

  const emptyBase = {
    year,
    unit: "百万円",
    filters: {
      ministry: filters.ministry?.trim() || null,
      payee: filters.payee?.trim() || null,
      sector: filters.sector?.trim() || null,
      focusKind: filters.focusKind ?? null,
      focusValue: filters.focusValue?.trim() || null,
    },
    totals: {
      amount: 0,
      projectCount: 0,
      payeeCount: 0,
      flowCount: 0,
      truncated: false,
    },
    nodes: [] as MoneyFlowNode[],
    links: [] as MoneyFlowLink[],
    rows: [],
    source: summary.source,
    availableYears,
    pendingYears,
    ministries: [],
    sectors,
    externalCompanies: [],
    nearbyMunicipal: [],
    houjinEnabled: isHoujinConfigured(),
    yearAvailable: false,
  };

  const dataset = loadGyoseiYear(year);
  if (!dataset) {
    const external = filters.payee
      ? await enrichExternalCompanies(filters.payee, null)
      : { externalCompanies: [], nearbyMunicipal: [] };
    return {
      ...emptyBase,
      ...external,
      message:
        `${year}年度のデータはまだ同梱されていません。行政事業レビュー見える化サイト（rssystem.go.jp）の CSV を取り込むと選べるようになります。`,
    };
  }

  const ministryFilter = filters.ministry?.trim() || null;
  const payeeFilter = normalizePayeeQuery(filters.payee);
  const sectorFilter = filters.sector?.trim() || null;
  const focusKind = filters.focusKind ?? null;
  const focusValue = filters.focusValue?.trim() || null;
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
    const [projectIndex, payeeIndex, amount, block, , , work] = dataset.flows[i];
    const project = dataset.projects[projectIndex];
    if (project[6]) continue;

    if (ministryIndex !== null && project[0] !== ministryIndex) continue;

    const payeeName = dataset.dictionaries.payees[payeeIndex];
    if (payeeFilter) {
      const inName = normalizePayeeQuery(payeeName).includes(payeeFilter);
      const inWork = normalizePayeeQuery(work).includes(payeeFilter);
      const asSector = PAYEE_SECTORS.some(
        (sector) =>
          normalizePayeeQuery(sector.label) === payeeFilter ||
          sector.keywords.some((keyword) => normalizePayeeQuery(keyword) === payeeFilter),
      );
      const sectorHit = asSector
        ? matchSector(
            PAYEE_SECTORS.find(
              (sector) =>
                normalizePayeeQuery(sector.label) === payeeFilter ||
                sector.keywords.some((keyword) => normalizePayeeQuery(keyword) === payeeFilter),
            )?.id,
            payeeName,
            work,
          )
        : false;
      if (!inName && !inWork && !sectorHit) continue;
    }
    if (!matchSector(sectorFilter, payeeName, work)) continue;

    if (focusKind === "ministry" && focusValue) {
      if (dataset.dictionaries.ministries[project[0]] !== focusValue) continue;
    }
    if (focusKind === "project" && focusValue) {
      if (project[1] !== focusValue && !project[1].includes(focusValue)) continue;
    }
    if (focusKind === "payee" && focusValue) {
      if (
        payeeName !== focusValue &&
        !normalizePayeeQuery(payeeName).includes(normalizePayeeQuery(focusValue))
      ) {
        continue;
      }
    }
    if (focusKind === "block" && focusValue && block !== focusValue) continue;

    matchingFlowIndexes.push(i);
    totalAmount += amount;
    projectSet.add(projectIndex);
    payeeSet.add(payeeIndex);
  }

  const graph = buildGraph({
    dataset,
    matchingFlowIndexes,
    ministryFilter: ministryFilter || (focusKind === "ministry" ? focusValue : null),
    payeeFilter: payeeFilter || (focusKind === "payee" ? normalizePayeeQuery(focusValue) : ""),
    focusKind: focusKind ?? undefined,
    limit,
  });

  const rows = matchingFlowIndexes
    .slice()
    .sort((a, b) => dataset.flows[b][2] - dataset.flows[a][2])
    .slice(0, MAX_ROWS)
    .map((index) => {
      const [projectIndex, payeeIndex, amount, block, contractIndex, corpNumber, work] =
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
        corpNumber: corpNumber || undefined,
      };
    });

  const external = filters.payee
    ? await enrichExternalCompanies(filters.payee, dataset)
    : { externalCompanies: [], nearbyMunicipal: [] };

  return {
    year,
    unit: dataset.unit,
    filters: {
      ministry: ministryFilter,
      payee: filters.payee?.trim() || null,
      sector: sectorFilter,
      focusKind,
      focusValue,
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
    pendingYears,
    ministries: [...dataset.dictionaries.ministries].sort((a, b) =>
      a.localeCompare(b, "ja"),
    ),
    sectors,
    ...external,
    houjinEnabled: isHoujinConfigured(),
    yearAvailable: true,
  };
}

async function enrichExternalCompanies(
  query: string,
  dataset: GyoseiYearDataset | null,
) {
  const houjin = await searchHoujinByName(query, 8);
  const reviewAmounts = new Map<string, number>();

  if (dataset) {
    const needle = normalizePayeeQuery(query);
    for (const [projectIndex, payeeIndex, amount] of dataset.flows) {
      if (dataset.projects[projectIndex][6]) continue;
      const name = dataset.dictionaries.payees[payeeIndex];
      const corp = dataset.flows.find((flow) => flow[1] === payeeIndex)?.[5] ?? "";
      if (
        normalizePayeeQuery(name).includes(needle) ||
        (corp && houjin.some((company) => company.corporateNumber === corp))
      ) {
        reviewAmounts.set(name, (reviewAmounts.get(name) ?? 0) + amount);
      }
    }
  }

  const externalCompanies = houjin.map((company) => {
    const matchedAmount =
      [...reviewAmounts.entries()].find(([name]) =>
        normalizePayeeQuery(name).includes(normalizePayeeQuery(company.name)),
      )?.[1] ?? 0;
    return {
      name: company.name,
      corporateNumber: company.corporateNumber,
      address: company.address,
      prefecture: company.prefecture || parseJapanAddress(company.address).prefecture,
      city: company.city || parseJapanAddress(company.address).city,
      inReviewData: matchedAmount > 0,
      reviewAmount: round1(matchedAmount),
    };
  });

  // レビューに無い会社でも一覧に出す。逆に NTA 未設定時はクエリ名だけ出す。
  if (externalCompanies.length === 0 && query.trim()) {
    const amount = reviewAmounts.get(
      [...reviewAmounts.keys()].find((name) =>
        normalizePayeeQuery(name).includes(normalizePayeeQuery(query)),
      ) ?? "",
    ) ?? 0;
    externalCompanies.push({
      name: query.trim(),
      corporateNumber: "",
      address: "",
      prefecture: "",
      city: "",
      inReviewData: amount > 0,
      reviewAmount: round1(amount),
    });
  }

  const nearbyMunicipal = dataset
    ? findNearbyMunicipalPayees(dataset, externalCompanies)
    : [];

  return { externalCompanies, nearbyMunicipal };
}

function findNearbyMunicipalPayees(
  dataset: GyoseiYearDataset,
  companies: Array<{ prefecture: string; city: string }>,
): NearbyMunicipalPayee[] {
  const targets = new Set<string>();
  for (const company of companies) {
    if (company.city) targets.add(company.city.replace(/市$|区$|町$|村$/, ""));
    if (company.prefecture) targets.add(company.prefecture.replace(/都$|道$|府$|県$/, ""));
    if (company.city) targets.add(company.city);
    if (company.prefecture) targets.add(company.prefecture);
  }
  if (targets.size === 0) return [];

  const bucket = new Map<string, { amount: number; projects: Set<number>; payee: string }>();

  for (let i = 0; i < dataset.flows.length; i += 1) {
    const [projectIndex, payeeIndex, amount] = dataset.flows[i];
    if (dataset.projects[projectIndex][6]) continue;
    const payee = dataset.dictionaries.payees[payeeIndex];
    const hit = [...targets].find((token) => token.length >= 2 && payee.includes(token));
    if (!hit) continue;
    const key = `${hit}::${payee}`;
    const current = bucket.get(key) ?? {
      amount: 0,
      projects: new Set<number>(),
      payee,
    };
    current.amount += amount;
    current.projects.add(projectIndex);
    bucket.set(key, current);
  }

  return [...bucket.entries()]
    .map(([key, value]) => ({
      municipality: key.split("::")[0],
      payee: value.payee,
      amount: round1(value.amount),
      projectCount: value.projects.size,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 20);
}

function buildGraph(args: {
  dataset: GyoseiYearDataset;
  matchingFlowIndexes: number[];
  ministryFilter: string | null;
  payeeFilter: string;
  focusKind: MoneyFlowFilters["focusKind"];
  limit: number;
}): { nodes: MoneyFlowNode[]; links: MoneyFlowLink[]; truncated: boolean } {
  const { dataset, matchingFlowIndexes, ministryFilter, payeeFilter, focusKind, limit } =
    args;

  // ドリルダウン後は層を一段深く見せる（府省庁→事業→ブロック→支出先 など）
  if (focusKind === "payee") {
    return buildPayeeDrillGraph(dataset, matchingFlowIndexes, limit);
  }
  if (focusKind === "project") {
    return buildProjectDrillGraph(dataset, matchingFlowIndexes, limit);
  }
  if (focusKind === "ministry" || ministryFilter) {
    return buildMinistryDrillGraph(dataset, matchingFlowIndexes, limit);
  }

  return buildOverviewGraph(dataset, matchingFlowIndexes, Boolean(payeeFilter), limit);
}

function buildOverviewGraph(
  dataset: GyoseiYearDataset,
  matchingFlowIndexes: number[],
  focusedPayee: boolean,
  limit: number,
) {
  const ministryTotals = new Map<number, number>();
  const projectTotals = new Map<number, number>();
  const payeeTotals = new Map<number, number>();
  const ministryToProject = new Map<string, number>();
  const projectToPayee = new Map<string, number>();

  for (const index of matchingFlowIndexes) {
    const [projectIndex, payeeIndex, amount] = dataset.flows[index];
    const ministryIndex = dataset.projects[projectIndex][0];
    ministryTotals.set(ministryIndex, (ministryTotals.get(ministryIndex) ?? 0) + amount);
    projectTotals.set(projectIndex, (projectTotals.get(projectIndex) ?? 0) + amount);
    payeeTotals.set(payeeIndex, (payeeTotals.get(payeeIndex) ?? 0) + amount);
    ministryToProject.set(
      `${ministryIndex}>${projectIndex}`,
      (ministryToProject.get(`${ministryIndex}>${projectIndex}`) ?? 0) + amount,
    );
    projectToPayee.set(
      `${projectIndex}>${payeeIndex}`,
      (projectToPayee.get(`${projectIndex}>${payeeIndex}`) ?? 0) + amount,
    );
  }

  const topMinistries = topKeys(ministryTotals, focusedPayee ? Math.min(limit, 12) : Math.min(limit, 14));
  const topProjects = topKeys(projectTotals, focusedPayee ? Math.min(limit, 24) : Math.min(limit, 18));
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

  const governmentAmount = sumMap(ministryTotals);
  addNode({
    id: "gov",
    label: "政府全体",
    kind: "government",
    amount: round1(governmentAmount),
    drillable: false,
  });

  for (const ministryIndex of topMinistries) {
    const id = `m:${ministryIndex}`;
    addNode({
      id,
      label: dataset.dictionaries.ministries[ministryIndex],
      kind: "ministry",
      amount: round1(ministryTotals.get(ministryIndex) ?? 0),
      drillable: true,
    });
    links.push({
      source: "gov",
      target: id,
      amount: round1(ministryTotals.get(ministryIndex) ?? 0),
    });
  }

  for (const projectIndex of topProjects) {
    const project = dataset.projects[projectIndex];
    if (!ministrySet.has(project[0])) continue;
    const id = `p:${projectIndex}`;
    addNode({
      id,
      label: truncate(project[1], 28),
      rawLabel: project[1],
      kind: "project",
      amount: round1(projectTotals.get(projectIndex) ?? 0),
      drillable: true,
    });
    links.push({
      source: `m:${project[0]}`,
      target: id,
      amount: round1(
        ministryToProject.get(`${project[0]}>${projectIndex}`) ??
          projectTotals.get(projectIndex) ??
          0,
      ),
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
      rawLabel: dataset.dictionaries.payees[payeeIndex],
      kind: "payee",
      amount: round1(payeeTotals.get(payeeIndex) ?? 0),
      drillable: true,
    });
    links.push({
      source: `p:${projectIndex}`,
      target: payeeId,
      amount: round1(amount),
    });
  }

  return {
    nodes,
    links: links.filter((link) => link.amount > 0),
    truncated:
      ministryTotals.size > topMinistries.length ||
      projectTotals.size > topProjects.length ||
      payeeTotals.size > topPayees.length,
  };
}

function buildMinistryDrillGraph(
  dataset: GyoseiYearDataset,
  matchingFlowIndexes: number[],
  limit: number,
) {
  const projectTotals = new Map<number, number>();
  const payeeTotals = new Map<number, number>();
  const projectToPayee = new Map<string, number>();
  let ministryName = "府省庁";
  let ministryAmount = 0;

  for (const index of matchingFlowIndexes) {
    const [projectIndex, payeeIndex, amount] = dataset.flows[index];
    const project = dataset.projects[projectIndex];
    ministryName = dataset.dictionaries.ministries[project[0]];
    ministryAmount += amount;
    projectTotals.set(projectIndex, (projectTotals.get(projectIndex) ?? 0) + amount);
    payeeTotals.set(payeeIndex, (payeeTotals.get(payeeIndex) ?? 0) + amount);
    projectToPayee.set(
      `${projectIndex}>${payeeIndex}`,
      (projectToPayee.get(`${projectIndex}>${payeeIndex}`) ?? 0) + amount,
    );
  }

  const topProjects = topKeys(projectTotals, Math.min(limit, 28));
  const topPayees = topKeys(payeeTotals, Math.min(limit, 28));
  const projectSet = new Set(topProjects);
  const payeeSet = new Set(topPayees);
  const nodes: MoneyFlowNode[] = [
    {
      id: "root",
      label: ministryName,
      kind: "ministry",
      amount: round1(ministryAmount),
      drillable: false,
    },
  ];
  const links: MoneyFlowLink[] = [];

  for (const projectIndex of topProjects) {
    const id = `p:${projectIndex}`;
    nodes.push({
      id,
      label: truncate(dataset.projects[projectIndex][1], 30),
      rawLabel: dataset.projects[projectIndex][1],
      kind: "project",
      amount: round1(projectTotals.get(projectIndex) ?? 0),
      drillable: true,
    });
    links.push({
      source: "root",
      target: id,
      amount: round1(projectTotals.get(projectIndex) ?? 0),
    });
  }

  for (const [key, amount] of projectToPayee) {
    const [projectIndexText, payeeIndexText] = key.split(">");
    const projectIndex = Number(projectIndexText);
    const payeeIndex = Number(payeeIndexText);
    if (!projectSet.has(projectIndex) || !payeeSet.has(payeeIndex)) continue;
    const payeeId = `c:${payeeIndex}`;
    if (!nodes.some((node) => node.id === payeeId)) {
      nodes.push({
        id: payeeId,
        label: truncate(dataset.dictionaries.payees[payeeIndex], 24),
        rawLabel: dataset.dictionaries.payees[payeeIndex],
        kind: "payee",
        amount: round1(payeeTotals.get(payeeIndex) ?? 0),
        drillable: true,
      });
    }
    links.push({ source: `p:${projectIndex}`, target: payeeId, amount: round1(amount) });
  }

  return {
    nodes,
    links,
    truncated:
      projectTotals.size > topProjects.length || payeeTotals.size > topPayees.length,
  };
}

function buildProjectDrillGraph(
  dataset: GyoseiYearDataset,
  matchingFlowIndexes: number[],
  limit: number,
) {
  const blockTotals = new Map<string, number>();
  const payeeTotals = new Map<number, number>();
  const blockToPayee = new Map<string, number>();
  let projectName = "事業";
  let projectAmount = 0;

  for (const index of matchingFlowIndexes) {
    const [projectIndex, payeeIndex, amount, block] = dataset.flows[index];
    projectName = dataset.projects[projectIndex][1];
    projectAmount += amount;
    const blockKey = block || "A";
    blockTotals.set(blockKey, (blockTotals.get(blockKey) ?? 0) + amount);
    payeeTotals.set(payeeIndex, (payeeTotals.get(payeeIndex) ?? 0) + amount);
    blockToPayee.set(
      `${blockKey}>${payeeIndex}`,
      (blockToPayee.get(`${blockKey}>${payeeIndex}`) ?? 0) + amount,
    );
  }

  const topBlocks = [...blockTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.min(limit, 16))
    .map(([block]) => block);
  const topPayees = topKeys(payeeTotals, Math.min(limit, 28));
  const blockSet = new Set(topBlocks);
  const payeeSet = new Set(topPayees);

  const nodes: MoneyFlowNode[] = [
    {
      id: "root",
      label: truncate(projectName, 36),
      kind: "project",
      amount: round1(projectAmount),
      drillable: false,
    },
  ];
  const links: MoneyFlowLink[] = [];

  for (const block of topBlocks) {
    const id = `b:${block}`;
    nodes.push({
      id,
      label: `ブロック ${block}`,
      kind: "block",
      amount: round1(blockTotals.get(block) ?? 0),
      drillable: true,
    });
    links.push({
      source: "root",
      target: id,
      amount: round1(blockTotals.get(block) ?? 0),
    });
  }

  for (const [key, amount] of blockToPayee) {
    const [block, payeeIndexText] = key.split(">");
    const payeeIndex = Number(payeeIndexText);
    if (!blockSet.has(block) || !payeeSet.has(payeeIndex)) continue;
    const payeeId = `c:${payeeIndex}`;
    if (!nodes.some((node) => node.id === payeeId)) {
      nodes.push({
        id: payeeId,
        label: truncate(dataset.dictionaries.payees[payeeIndex], 24),
        rawLabel: dataset.dictionaries.payees[payeeIndex],
        kind: "payee",
        amount: round1(payeeTotals.get(payeeIndex) ?? 0),
        drillable: true,
      });
    }
    links.push({ source: `b:${block}`, target: payeeId, amount: round1(amount) });
  }

  return {
    nodes,
    links,
    truncated: blockTotals.size > topBlocks.length || payeeTotals.size > topPayees.length,
  };
}

function buildPayeeDrillGraph(
  dataset: GyoseiYearDataset,
  matchingFlowIndexes: number[],
  limit: number,
) {
  const ministryTotals = new Map<number, number>();
  const projectTotals = new Map<number, number>();
  const ministryToProject = new Map<string, number>();
  let payeeName = "支出先";
  let payeeAmount = 0;

  for (const index of matchingFlowIndexes) {
    const [projectIndex, payeeIndex, amount] = dataset.flows[index];
    payeeName = dataset.dictionaries.payees[payeeIndex];
    payeeAmount += amount;
    const ministryIndex = dataset.projects[projectIndex][0];
    ministryTotals.set(ministryIndex, (ministryTotals.get(ministryIndex) ?? 0) + amount);
    projectTotals.set(projectIndex, (projectTotals.get(projectIndex) ?? 0) + amount);
    ministryToProject.set(
      `${ministryIndex}>${projectIndex}`,
      (ministryToProject.get(`${ministryIndex}>${projectIndex}`) ?? 0) + amount,
    );
  }

  const topMinistries = topKeys(ministryTotals, Math.min(limit, 16));
  const topProjects = topKeys(projectTotals, Math.min(limit, 28));
  const ministrySet = new Set(topMinistries);
  const projectSet = new Set(topProjects);

  const nodes: MoneyFlowNode[] = [];
  const links: MoneyFlowLink[] = [];

  for (const ministryIndex of topMinistries) {
    const id = `m:${ministryIndex}`;
    nodes.push({
      id,
      label: dataset.dictionaries.ministries[ministryIndex],
      kind: "ministry",
      amount: round1(ministryTotals.get(ministryIndex) ?? 0),
      drillable: true,
    });
  }

  for (const projectIndex of topProjects) {
    const project = dataset.projects[projectIndex];
    if (!ministrySet.has(project[0])) continue;
    const id = `p:${projectIndex}`;
    nodes.push({
      id,
      label: truncate(project[1], 28),
      rawLabel: project[1],
      kind: "project",
      amount: round1(projectTotals.get(projectIndex) ?? 0),
      drillable: true,
    });
    links.push({
      source: `m:${project[0]}`,
      target: id,
      amount: round1(
        ministryToProject.get(`${project[0]}>${projectIndex}`) ??
          projectTotals.get(projectIndex) ??
          0,
      ),
    });
  }

  nodes.push({
    id: "payee",
    label: truncate(payeeName, 28),
    rawLabel: payeeName,
    kind: "payee",
    amount: round1(payeeAmount),
    drillable: false,
  });

  for (const projectIndex of topProjects) {
    if (!projectSet.has(projectIndex)) continue;
    if (!ministrySet.has(dataset.projects[projectIndex][0])) continue;
    links.push({
      source: `p:${projectIndex}`,
      target: "payee",
      amount: round1(projectTotals.get(projectIndex) ?? 0),
    });
  }

  return {
    nodes,
    links,
    truncated:
      ministryTotals.size > topMinistries.length ||
      projectTotals.size > topProjects.length,
  };
}

function topKeys(map: Map<number, number>, limit: number): number[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key]) => key);
}

function sumMap(map: Map<number, number>): number {
  return [...map.values()].reduce((sum, value) => sum + value, 0);
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
