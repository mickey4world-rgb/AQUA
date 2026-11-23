/**
 * 行政事業レビュー「公開五鏡」— 公式ガイドブックの読解順に沿った公開通帳。
 * 支出 CSV（MoneyFlowResponse）だけを根拠にし、EBPM 全文は推測しない。
 */
import type {
  MoneyFlowNode,
  MoneyFlowResponse,
  MoneyFlowRow,
} from "@/lib/types/gyosei";
import {
  filterRowsBySelectedNode,
  kindLabelJa,
  nodeDisplayName,
} from "@/lib/works-money-flow-ui";

/** 既存 payee-dossier と同系の「競争性が薄い」契約ヒント */
export const SOLE_SOURCE_HINTS = ["随意", "特命", "企画競争", "公募", "指名", "一者"];

export type FiveMirrorId =
  | "source"
  | "volume"
  | "landing"
  | "method"
  | "flag";

export type FiveMirrorContractMix = {
  method: string;
  amount: number;
  share: number;
};

export type FiveMirrorPayeeShare = {
  name: string;
  amount: number;
  share: number;
};

export type FiveMirrorFlag = {
  level: "info" | "watch" | "caution";
  title: string;
  detail: string;
};

export type FiveMirrorCard = {
  id: FiveMirrorId;
  index: number;
  title: string;
  question: string;
  answer: string;
  detail: string;
};

export type FiveMirrorsBrief = {
  year: number;
  unit: string;
  scopeLabel: string;
  cards: FiveMirrorCard[];
  contractMix: FiveMirrorContractMix[];
  topPayees: FiveMirrorPayeeShare[];
  flags: FiveMirrorFlag[];
  totals: {
    amount: number;
    projectCount: number;
    payeeCount: number;
    flowCount: number;
    soleSourceShare: number | null;
    topPayeeShare: number | null;
  };
  officialLinks: Array<{ label: string; href: string }>;
  activeMirror: FiveMirrorId;
};

export const OFFICIAL_REVIEW_LINKS: Array<{ label: string; href: string }> = [
  {
    label: "行政事業レビュー見える化サイト",
    href: "https://rssystem.go.jp",
  },
  {
    label: "レビューシート作成ガイドブック（PDF）",
    href: "https://www.gyoukaku.go.jp/review/img/R07sakusei-guidebook_ver1-2.pdf",
  },
  {
    label: "各府省庁の行政事業レビュー",
    href: "https://www.gyoukaku.go.jp/review/fusyo",
  },
  {
    label: "主要事項データベース（出典）",
    href: "https://www.gyoukaku.go.jp/review/database/index.html",
  },
];

export function isSoleSourceContractLabel(label: string | null | undefined): boolean {
  if (!label) return false;
  return SOLE_SOURCE_HINTS.some((hint) => label.includes(hint));
}

function sumAmount(rows: MoneyFlowRow[]): number {
  return rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
}

export function buildContractMix(rows: MoneyFlowRow[]): FiveMirrorContractMix[] {
  const byMethod = new Map<string, number>();
  for (const row of rows) {
    const method = (row.contract && row.contract.trim()) || "（契約方式の記載なし）";
    byMethod.set(method, (byMethod.get(method) ?? 0) + (Number(row.amount) || 0));
  }
  const total = [...byMethod.values()].reduce((a, b) => a + b, 0);
  if (!(total > 0)) return [];
  return [...byMethod.entries()]
    .map(([method, amount]) => ({
      method,
      amount,
      share: amount / total,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 8);
}

export function buildTopPayeeShares(
  rows: MoneyFlowRow[],
  limit = 5,
): FiveMirrorPayeeShare[] {
  const byPayee = new Map<string, number>();
  for (const row of rows) {
    const name = row.payee?.trim() || "（支出先不明）";
    byPayee.set(name, (byPayee.get(name) ?? 0) + (Number(row.amount) || 0));
  }
  const total = [...byPayee.values()].reduce((a, b) => a + b, 0);
  if (!(total > 0)) return [];
  return [...byPayee.entries()]
    .map(([name, amount]) => ({
      name,
      amount,
      share: amount / total,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

export function soleSourceShareOf(rows: MoneyFlowRow[]): number | null {
  let sole = 0;
  let known = 0;
  for (const row of rows) {
    const amount = Number(row.amount) || 0;
    if (!(amount > 0)) continue;
    if (!row.contract || !row.contract.trim()) continue;
    known += amount;
    if (isSoleSourceContractLabel(row.contract)) sole += amount;
  }
  if (!(known > 0)) return null;
  return sole / known;
}

function uniqueCount(rows: MoneyFlowRow[], key: "ministry" | "project" | "payee"): number {
  return new Set(rows.map((r) => r[key]).filter(Boolean)).size;
}

function formatAmount(amount: number, unit: string): string {
  return `${amount.toLocaleString("ja-JP")} ${unit}`;
}

function pct(share: number): string {
  return `${Math.round(share * 100)}%`;
}

function scopeLabel(
  data: MoneyFlowResponse,
  selectedNode: MoneyFlowNode | null,
): string {
  if (selectedNode && selectedNode.kind !== "government") {
    return `${kindLabelJa(selectedNode.kind)}「${nodeDisplayName(selectedNode)}」`;
  }
  if (data.filters.payee) return `支出先「${data.filters.payee}」`;
  if (data.filters.ministry) return data.filters.ministry;
  if (data.filters.sector) {
    const sector = data.sectors.find((s) => s.id === data.filters.sector);
    return sector ? `分野「${sector.label}」` : "分野絞り込み";
  }
  return "政府全体";
}

function mirrorFromSelection(selectedNode: MoneyFlowNode | null): FiveMirrorId {
  if (!selectedNode || selectedNode.kind === "government") return "source";
  if (selectedNode.kind === "ministry" || selectedNode.kind === "project") {
    return "source";
  }
  if (selectedNode.kind === "payee") return "landing";
  if (selectedNode.kind === "block") return "volume";
  return "source";
}

export function buildFiveMirrorFlags(input: {
  rows: MoneyFlowRow[];
  topPayees: FiveMirrorPayeeShare[];
  soleSourceShare: number | null;
  truncated: boolean;
}): FiveMirrorFlag[] {
  const flags: FiveMirrorFlag[] = [];
  const top = input.topPayees[0];
  if (top && top.share >= 0.35) {
    flags.push({
      level: top.share >= 0.5 ? "caution" : "watch",
      title: `支出先「${top.name}」に ${pct(top.share)} が集中`,
      detail:
        "公開明細上の着地が偏っています。事業の性質（年金・交付金など）か、受注集中かを分けて読む必要があります。",
    });
  }
  if (input.soleSourceShare != null && input.soleSourceShare >= 0.4) {
    flags.push({
      level: input.soleSourceShare >= 0.6 ? "caution" : "watch",
      title: `競争性が薄い契約が約 ${pct(input.soleSourceShare)}`,
      detail:
        "随意・特命・公募・指名などの記載割合です。価格競争の余地と理由説明をガイドブックの点検観点で確認できます。",
    });
  }
  const missingContract = input.rows.filter((r) => !r.contract || !r.contract.trim());
  const missingShare =
    input.rows.length > 0 ? missingContract.length / input.rows.length : 0;
  if (missingShare >= 0.5 && input.rows.length >= 5) {
    flags.push({
      level: "info",
      title: "契約方式の記載がない行が多い",
      detail:
        "見える化サイトの支出情報に契約方式が空の行があります。選び方の鏡は記載のある行だけで集計しています。",
    });
  }
  if (input.truncated) {
    flags.push({
      level: "info",
      title: "表示は上位に切り詰められています",
      detail: "画面のサンキー／明細は件数上限あり。全体額は totals を参照してください。",
    });
  }
  if (flags.length === 0) {
    flags.push({
      level: "info",
      title: "支出データの範囲では大きな集中・非競争フラグは目立ちません",
      detail:
        "効果発現経路やKPIは支出CSVに含まれません。公式シートで点検・改善欄を確認してください。",
    });
  }
  return flags.slice(0, 4);
}

/** MoneyFlowResponse（＋選択ノード）から公開五鏡の通帳を組み立てる */
export function buildFiveMirrorsBrief(
  data: MoneyFlowResponse,
  selectedNode: MoneyFlowNode | null = null,
): FiveMirrorsBrief {
  const rows = filterRowsBySelectedNode(data.rows, selectedNode);
  const amount = rows.length > 0 ? sumAmount(rows) : data.totals.amount;
  const projectCount =
    rows.length > 0 ? uniqueCount(rows, "project") : data.totals.projectCount;
  const payeeCount =
    rows.length > 0 ? uniqueCount(rows, "payee") : data.totals.payeeCount;
  const flowCount = rows.length > 0 ? rows.length : data.totals.flowCount;
  const ministryCount = uniqueCount(rows.length > 0 ? rows : data.rows, "ministry");
  const contractMix = buildContractMix(rows.length > 0 ? rows : data.rows);
  const topPayees = buildTopPayeeShares(rows.length > 0 ? rows : data.rows, 5);
  const soleSourceShare = soleSourceShareOf(rows.length > 0 ? rows : data.rows);
  const topPayeeShare = topPayees[0]?.share ?? null;
  const scope = scopeLabel(data, selectedNode);
  const flags = buildFiveMirrorFlags({
    rows: rows.length > 0 ? rows : data.rows,
    topPayees,
    soleSourceShare,
    truncated: data.totals.truncated,
  });

  const topMethod = contractMix[0];
  const topPayee = topPayees[0];

  const cards: FiveMirrorCard[] = [
    {
      id: "source",
      index: 1,
      title: "源流",
      question: "誰の事業か？",
      answer: scope,
      detail: `${data.year}年度 · 府省 ${ministryCount} · 事業 ${projectCount}`,
    },
    {
      id: "volume",
      index: 2,
      title: "水量",
      question: "いくら動いたか？",
      answer: formatAmount(amount, data.unit),
      detail: `明細 ${flowCount.toLocaleString("ja-JP")} 行（表示範囲）`,
    },
    {
      id: "landing",
      index: 3,
      title: "着地",
      question: "誰が受けたか？",
      answer: topPayee
        ? `上位「${topPayee.name}」${pct(topPayee.share)}`
        : `支出先 ${payeeCount} 件`,
      detail: `支出先 ${payeeCount.toLocaleString("ja-JP")} · サンキー右列が着地`,
    },
    {
      id: "method",
      index: 4,
      title: "選び方",
      question: "どう選ばれたか？",
      answer: topMethod
        ? `最多は「${topMethod.method}」${pct(topMethod.share)}`
        : "契約方式の記載が少ない",
      detail:
        soleSourceShare != null
          ? `競争性が薄い契約（随意等）約 ${pct(soleSourceShare)}`
          : "契約方式が載っている行だけで集計",
    },
    {
      id: "flag",
      index: 5,
      title: "疑いの旗",
      question: "どこを疑うか？",
      answer: flags[0]?.title ?? "特記なし",
      detail: flags[0]?.detail ?? "",
    },
  ];

  return {
    year: data.year,
    unit: data.unit,
    scopeLabel: scope,
    cards,
    contractMix,
    topPayees,
    flags,
    totals: {
      amount,
      projectCount,
      payeeCount,
      flowCount,
      soleSourceShare,
      topPayeeShare,
    },
    officialLinks: OFFICIAL_REVIEW_LINKS,
    activeMirror: mirrorFromSelection(selectedNode),
  };
}

/** 五鏡の用語でサンキー凡例を説明する */
export function fiveMirrorsSankeyLegend(): Array<{ label: string; color: string }> {
  return [
    { label: "源流（府省庁）", color: "#5eead4" },
    { label: "事業", color: "#67e8f9" },
    { label: "着地（支出先）", color: "#fcd34d" },
  ];
}

export function fiveMirrorsFocusDescription(
  selectedNode: MoneyFlowNode | null,
  brief: FiveMirrorsBrief,
): string {
  if (!selectedNode || selectedNode.kind === "government") {
    return `公開五鏡の順で読む · いまの範囲「${brief.scopeLabel}」· 列は源流→事業→着地`;
  }
  const mirror =
    selectedNode.kind === "payee"
      ? "着地"
      : selectedNode.kind === "ministry" || selectedNode.kind === "project"
        ? "源流"
        : "水量";
  return `いま見ている鏡: ${mirror} · ${kindLabelJa(selectedNode.kind)}「${nodeDisplayName(selectedNode)}」`;
}
