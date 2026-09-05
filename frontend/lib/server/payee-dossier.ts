import { normalizeCompanyQuery, splitWorkAndAddress } from "@/lib/server/company-address";
import { listGyoseiYears, loadGyoseiYear } from "@/lib/server/gyosei-data";
import type {
  GyoseiYearDataset,
  PayeeContractPartner,
  PayeeDossier,
  PayeeIssue,
  PayeeRecentContract,
  PayeeYearPoint,
} from "@/lib/types/gyosei";

export type {
  PayeeContractPartner,
  PayeeDossier,
  PayeeIssue,
  PayeeRecentContract,
  PayeeYearPoint,
};

const SOLE_SOURCE_HINTS = ["随意", "特命", "企画競争", "公募", "指名"];

export function buildPayeeDossier(query: string): PayeeDossier | null {
  const needle = normalizeCompanyQuery(query);
  if (!needle) return null;

  const years = listGyoseiYears();
  const yearPoints: PayeeYearPoint[] = [];
  const partners = new Map<string, { amount: number; projects: Set<string> }>();
  const methods = new Map<string, number>();
  const recent: PayeeRecentContract[] = [];
  let matchedName = query.trim();
  let corporateNumber = "";
  let address = "";
  let totalAmount = 0;
  let soleAmount = 0;
  let methodAmount = 0;
  let suspectHits = 0;

  for (const fiscalYear of years) {
    const dataset = loadGyoseiYear(fiscalYear);
    if (!dataset) continue;
    const hit = collectYearHits(dataset, needle);
    if (!hit) continue;

    if (hit.name.length >= matchedName.length) matchedName = hit.name;
    if (!corporateNumber && hit.corporateNumber) corporateNumber = hit.corporateNumber;
    if (!address && hit.address) address = hit.address;

    yearPoints.push({
      fiscalYear,
      amount: round1(hit.amount),
      projectCount: hit.projects.size,
      contractCount: hit.contractCount,
    });
    totalAmount += hit.amount;
    suspectHits += hit.suspectHits;

    for (const [ministry, value] of hit.partners) {
      const current = partners.get(ministry) ?? { amount: 0, projects: new Set<string>() };
      current.amount += value.amount;
      for (const project of value.projects) current.projects.add(project);
      partners.set(ministry, current);
    }
    for (const [method, amount] of hit.methods) {
      methods.set(method, (methods.get(method) ?? 0) + amount);
      methodAmount += amount;
      if (SOLE_SOURCE_HINTS.some((hint) => method.includes(hint))) {
        soleAmount += amount;
      }
    }
    recent.push(...hit.recent);
  }

  if (yearPoints.length === 0) {
    return {
      name: matchedName,
      corporateNumber,
      address,
      unit: "百万円",
      years: [],
      totalAmount: 0,
      trend: {
        label: "データ不足",
        changeRate: null,
        summary: "行政事業レビューに該当する支出先が見つかりませんでした。",
      },
      procurement: {
        verdict: "判断材料不足",
        summary: "レビュー上の契約実績がないため、公開情報だけでは調達可否を判断できません。",
      },
      issues: [
        {
          level: "watch",
          title: "レビュー実績なし",
          detail: "国の行政事業レビュー支出先に名前が見当たりません。民間取引や地方単独契約の可能性があります。",
        },
      ],
      partners: [],
      recentContracts: [],
      contractMix: [],
      soleSourceShare: null,
      suspensions: [],
      reputation: {
        japanTitle: null,
        japanSummary: null,
        japanUrl: null,
        worldTitle: null,
        worldSummary: null,
        worldUrl: null,
        notes: [],
      },
      finance: {
        symbol: null,
        exchange: null,
        currency: null,
        lastPrice: null,
        change5yPct: null,
        drawdownFromPeakPct: null,
        summary: "公開株価を未取得です。",
        concern: false,
      },
    };
  }

  yearPoints.sort((a, b) => a.fiscalYear - b.fiscalYear);
  const trend = buildTrend(yearPoints);
  const soleSourceShare = methodAmount > 0 ? soleAmount / methodAmount : null;
  const partnerList = [...partners.entries()]
    .map(([ministry, value]) => ({
      ministry,
      amount: round1(value.amount),
      projectCount: value.projects.size,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 8);

  const contractMix = [...methods.entries()]
    .map(([method, amount]) => ({
      method,
      amount: round1(amount),
      share: methodAmount > 0 ? amount / methodAmount : 0,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 6);

  const issues = buildIssues({
    trend,
    soleSourceShare,
    partnerList,
    yearPoints,
    suspectHits,
    totalAmount,
  });
  const procurement = buildProcurementVerdict(issues, trend, yearPoints.length);

  return {
    name: matchedName,
    corporateNumber,
    address,
    unit: "百万円",
    years: yearPoints,
    totalAmount: round1(totalAmount),
    trend,
    procurement,
    issues,
    partners: partnerList,
    recentContracts: recent
      .sort((a, b) => b.fiscalYear - a.fiscalYear || b.amount - a.amount)
      .slice(0, 12),
    contractMix,
    soleSourceShare,
    suspensions: [],
    reputation: {
      japanTitle: null,
      japanSummary: null,
      japanUrl: null,
      worldTitle: null,
      worldSummary: null,
      worldUrl: null,
      notes: [],
    },
    finance: {
      symbol: null,
      exchange: null,
      currency: null,
      lastPrice: null,
      change5yPct: null,
      drawdownFromPeakPct: null,
      summary: "公開株価を未取得です。",
      concern: false,
    },
  };
}

function collectYearHits(dataset: GyoseiYearDataset, needle: string) {
  let amount = 0;
  let contractCount = 0;
  let name = "";
  let corporateNumber = "";
  let address = "";
  const projects = new Set<string>();
  const partners = new Map<string, { amount: number; projects: Set<string> }>();
  const methods = new Map<string, number>();
  const recent: PayeeRecentContract[] = [];

  for (const [projectIndex, payeeIndex, flowAmount, , contractIndex, corpNumber, rawWork] of dataset.flows) {
    const project = dataset.projects[projectIndex];
    if (!project || project[6]) continue;
    const payee = dataset.dictionaries.payees[payeeIndex];
    const key = normalizeCompanyQuery(payee);
    if (!key.includes(needle) && !needle.includes(key)) continue;

    amount += flowAmount;
    contractCount += 1;
    projects.add(project[5] || project[1]);
    name = payee;
    if (corpNumber) corporateNumber = corpNumber;
    const split = splitWorkAndAddress(rawWork || "");
    if (split.address) address = split.address;

    const ministry = dataset.dictionaries.ministries[project[0]] || "不明";
    const partner = partners.get(ministry) ?? { amount: 0, projects: new Set<string>() };
    partner.amount += flowAmount;
    partner.projects.add(project[1]);
    partners.set(ministry, partner);

    const method =
      contractIndex >= 0 ? dataset.dictionaries.contracts[contractIndex] || "方式不明" : "方式不明";
    methods.set(method, (methods.get(method) ?? 0) + flowAmount);

    recent.push({
      fiscalYear: dataset.fiscalYear,
      ministry,
      project: project[1],
      amount: round1(flowAmount),
      contract: contractIndex >= 0 ? dataset.dictionaries.contracts[contractIndex] : null,
      work: split.work,
    });
  }

  if (contractCount === 0) return null;
  return {
    amount,
    contractCount,
    projects,
    partners,
    methods,
    recent,
    name,
    corporateNumber,
    address,
    suspectHits: 0,
  };
}

function buildTrend(points: PayeeYearPoint[]) {
  if (points.length < 2) {
    return {
      label: "データ不足" as const,
      changeRate: null,
      summary: "比較できる年度が少ないため、受注の勢いをまだ判断できません。",
    };
  }
  const prev = points[points.length - 2]!;
  const last = points[points.length - 1]!;
  if (prev.amount <= 0) {
    return {
      label: "拡大" as const,
      changeRate: null,
      summary: `${last.fiscalYear}年度に国からの支出が確認できます。`,
    };
  }
  const changeRate = (last.amount - prev.amount) / prev.amount;
  if (changeRate >= 0.15) {
    return {
      label: "拡大" as const,
      changeRate,
      summary: `直近は前年度比 +${pct(changeRate)}。国からの受注は増えています（黒字傾向の代理指標）。`,
    };
  }
  if (changeRate <= -0.15) {
    return {
      label: "縮小" as const,
      changeRate,
      summary: `直近は前年度比 ${pct(changeRate)}。国からの受注が減っています（赤字・縮小の代理指標）。`,
    };
  }
  return {
    label: "横ばい" as const,
    changeRate,
    summary: `直近は前年度比 ${pct(changeRate)}。国からの受注はほぼ横ばいです。`,
  };
}

function buildIssues(args: {
  trend: PayeeDossier["trend"];
  soleSourceShare: number | null;
  partnerList: PayeeContractPartner[];
  yearPoints: PayeeYearPoint[];
  suspectHits: number;
  totalAmount: number;
}): PayeeIssue[] {
  const issues: PayeeIssue[] = [];
  const { trend, soleSourceShare, partnerList, yearPoints, suspectHits, totalAmount } = args;

  if (trend.label === "縮小") {
    issues.push({
      level: "caution",
      title: "国からの受注が縮小",
      detail: trend.summary,
    });
  } else if (trend.label === "拡大") {
    issues.push({
      level: "info",
      title: "国からの受注が拡大",
      detail: trend.summary,
    });
  }

  if (soleSourceShare != null && soleSourceShare >= 0.6) {
    issues.push({
      level: "watch",
      title: "競争性が低い契約が多い",
      detail: `随意契約・公募等の割合が約 ${pct(soleSourceShare)}。価格競争の余地を確認した方がよいです。`,
    });
  }

  if (partnerList.length === 1 && totalAmount > 0) {
    issues.push({
      level: "watch",
      title: "取引先府省が単一",
      detail: `${partnerList[0]!.ministry} への依存が高いため、発注元事情の影響を受けやすいです。`,
    });
  }

  if (yearPoints.length >= 3) {
    const amounts = yearPoints.map((point) => point.amount);
    const max = Math.max(...amounts);
    const min = Math.min(...amounts);
    if (max > 0 && min / max < 0.25) {
      issues.push({
        level: "watch",
        title: "年度ごとの振れが大きい",
        detail: "年によって受注額が大きく上下しています。単年度の実績だけで判断しない方がよいです。",
      });
    }
    const lastThree = yearPoints.slice(-3);
    if (
      lastThree.length === 3 &&
      lastThree[0]!.amount > lastThree[1]!.amount &&
      lastThree[1]!.amount > lastThree[2]!.amount
    ) {
      issues.push({
        level: "caution",
        title: "3年連続で受注減少",
        detail: `${lastThree[0]!.fiscalYear}→${lastThree[2]!.fiscalYear} で国からの支出が連続減少しています。財務・受注基盤の確認を推奨します。`,
      });
    }
  }

  const latest = yearPoints[yearPoints.length - 1];
  if (latest && latest.contractCount >= 8 && partnerList.length <= 2) {
    issues.push({
      level: "watch",
      title: "特定府省への集中受注",
      detail: `直近年度の契約が多く、取引先府省は ${partnerList.length} 先に偏っています。発注元依存リスクがあります。`,
    });
  }

  if (suspectHits > 0) {
    issues.push({
      level: "caution",
      title: "金額単位の疑わしい行あり",
      detail: "一部事業で金額入力の異常が疑われるため、該当行は集計から除外している場合があります。",
    });
  }

  if (issues.length === 0) {
    issues.push({
      level: "info",
      title: "目立つ警告は少ない",
      detail: "レビュー上の契約パターンに、大きな偏りや急減は見当たりません。",
    });
  }

  return issues;
}

function buildProcurementVerdict(
  issues: PayeeIssue[],
  trend: PayeeDossier["trend"],
  yearCount: number,
): PayeeDossier["procurement"] {
  const cautionCount = issues.filter((issue) => issue.level === "caution").length;
  const watchCount = issues.filter((issue) => issue.level === "watch").length;

  if (yearCount === 0) {
    return {
      verdict: "判断材料不足",
      summary: "公開レビューに契約が無いため、追加の与信・登記確認が必要です。",
    };
  }
  if (cautionCount >= 2 || (cautionCount >= 1 && trend.label === "縮小")) {
    return {
      verdict: "慎重に判断",
      summary: "受注縮小やデータ異常など注意点があります。契約方式・再委託・履行実績を個別確認してください。",
    };
  }
  if (watchCount >= 2 || cautionCount >= 1) {
    return {
      verdict: "注意して確認",
      summary: "大きな欠格事由は見えませんが、競争性や取引先の偏りを確認してから進めるのがよいです。",
    };
  }
  return {
    verdict: "問題なさそう",
    summary: "レビュー上の国との取引は継続的で、目立つ偏りも少ないです。通常の調達審査で足りそうです。",
  };
}

function pct(value: number): string {
  const signed = value > 0 ? `+${(value * 100).toFixed(0)}` : `${(value * 100).toFixed(0)}`;
  return `${signed}%`;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
