/**
 * 公開通帳スタンプ「七つの跡」— 支出 CSV だけで押せる監査印。
 * EBPM／KPI 全文は推測しない。押印なしも明示する（沈黙＝成功にしない）。
 */
import {
  buildContractMix,
  buildTopPayeeShares,
  soleSourceShareOf,
} from "@/lib/gyosei-five-mirrors";
import type { MoneyFlowNode, MoneyFlowResponse, MoneyFlowRow } from "@/lib/types/gyosei";
import { filterRowsBySelectedNode } from "@/lib/works-money-flow-ui";

export type SevenTraceId =
  | "concentration"
  | "weakCompetition"
  | "otherBucket"
  | "truncated"
  | "methodSkew"
  | "crossMinistry"
  | "singleLine";

export type SevenTraceLevel = "idle" | "info" | "watch" | "caution";

export type SevenTraceStamp = {
  id: SevenTraceId;
  index: number;
  title: string;
  question: string;
  pressed: boolean;
  level: SevenTraceLevel;
  verdict: string;
  detail: string;
  metricLabel: string | null;
};

export type SevenTracesBrief = {
  year: number;
  unit: string;
  scopeLabel: string;
  pressedCount: number;
  stamps: SevenTraceStamp[];
};

const OTHER_PAYEE_HINTS = ["その他", "その他の支出先", "共同実施事業者"];

function pct(share: number): string {
  return `${Math.round(share * 100)}%`;
}

function sumAmount(rows: MoneyFlowRow[]): number {
  return rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
}

function isOtherPayee(name: string): boolean {
  const n = name.trim();
  return OTHER_PAYEE_HINTS.some((h) => n === h || n.startsWith(h));
}

function otherBucketShare(rows: MoneyFlowRow[]): number | null {
  const total = sumAmount(rows);
  if (!(total > 0)) return null;
  const other = rows
    .filter((r) => isOtherPayee(r.payee || ""))
    .reduce((s, r) => s + (Number(r.amount) || 0), 0);
  return other / total;
}

function crossMinistryPayees(rows: MoneyFlowRow[]): Array<{ payee: string; ministries: number }> {
  const map = new Map<string, Set<string>>();
  for (const row of rows) {
    const payee = row.payee?.trim();
    const ministry = row.ministry?.trim();
    if (!payee || !ministry || isOtherPayee(payee)) continue;
    const set = map.get(payee) ?? new Set<string>();
    set.add(ministry);
    map.set(payee, set);
  }
  return [...map.entries()]
    .map(([payee, ministries]) => ({ payee, ministries: ministries.size }))
    .filter((x) => x.ministries >= 2)
    .sort((a, b) => b.ministries - a.ministries);
}

function topProjectShare(rows: MoneyFlowRow[]): { name: string; share: number } | null {
  const byProject = new Map<string, number>();
  for (const row of rows) {
    const name = row.project?.trim() || "（事業不明）";
    byProject.set(name, (byProject.get(name) ?? 0) + (Number(row.amount) || 0));
  }
  const total = [...byProject.values()].reduce((a, b) => a + b, 0);
  if (!(total > 0)) return null;
  const top = [...byProject.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!top) return null;
  return { name: top[0], share: top[1] / total };
}

function scopeLabel(data: MoneyFlowResponse, selectedNode: MoneyFlowNode | null): string {
  if (selectedNode && selectedNode.kind !== "government") {
    return selectedNode.rawLabel ?? selectedNode.label;
  }
  if (data.filters.ministry) return data.filters.ministry;
  if (data.filters.payee) return `支出先「${data.filters.payee}」`;
  return "政府全体";
}

/** MoneyFlowResponse から七つの跡を組み立てる（常に7枚。押印なしも表示） */
export function buildSevenTracesBrief(
  data: MoneyFlowResponse,
  selectedNode: MoneyFlowNode | null = null,
): SevenTracesBrief {
  const rows = filterRowsBySelectedNode(data.rows, selectedNode);
  const sourceRows = rows.length > 0 ? rows : data.rows;
  const topPayees = buildTopPayeeShares(sourceRows, 5);
  const contractMix = buildContractMix(sourceRows);
  const sole = soleSourceShareOf(sourceRows);
  const otherShare = otherBucketShare(sourceRows);
  const cross = crossMinistryPayees(sourceRows);
  const projectTop = topProjectShare(sourceRows);
  const topPayee = topPayees[0];
  const topMethod = contractMix.find((c) => !c.method.includes("記載なし")) ?? contractMix[0];

  const stamps: SevenTraceStamp[] = [
    {
      id: "concentration",
      index: 1,
      title: "集中の跡",
      question: "着地は偏っていないか？",
      pressed: Boolean(topPayee && topPayee.share >= 0.25),
      level:
        topPayee && topPayee.share >= 0.5
          ? "caution"
          : topPayee && topPayee.share >= 0.25
            ? "watch"
            : "idle",
      verdict:
        topPayee && topPayee.share >= 0.25
          ? `「${topPayee.name}」に ${pct(topPayee.share)}`
          : "大きな単一着地の偏りは目立ちません",
      detail:
        "表示範囲の支出先シェア。年金・交付金など制度上の集中と、受注集中は分けて読む。",
      metricLabel: topPayee ? pct(topPayee.share) : null,
    },
    {
      id: "weakCompetition",
      index: 2,
      title: "競争薄の跡",
      question: "競争性が薄い契約が多いか？",
      pressed: sole != null && sole >= 0.3,
      level: sole != null && sole >= 0.6 ? "caution" : sole != null && sole >= 0.3 ? "watch" : "idle",
      verdict:
        sole != null && sole >= 0.3
          ? `随意・公募等の記載が約 ${pct(sole)}`
          : sole == null
            ? "契約方式の記載が足りず判定保留"
            : "競争性が薄い契約の割合は低め",
      detail:
        "随意・特命・企画競争・公募・指名・一者などの記載割合（記載のある行のみ）。",
      metricLabel: sole != null ? pct(sole) : null,
    },
    {
      id: "otherBucket",
      index: 3,
      title: "「その他」の跡",
      question: "中身が見えない着地が大きいか？",
      pressed: otherShare != null && otherShare >= 0.12,
      level:
        otherShare != null && otherShare >= 0.3
          ? "caution"
          : otherShare != null && otherShare >= 0.12
            ? "watch"
            : "idle",
      verdict:
        otherShare != null && otherShare >= 0.12
          ? `「その他」系着地が約 ${pct(otherShare)}`
          : "「その他」系の巨大バケツは目立ちません",
      detail:
        "支出先名が「その他」等の合算行は、公開の読みやすさを犠牲にしやすい。明細ドリルで中身を確認。",
      metricLabel: otherShare != null ? pct(otherShare) : null,
    },
    {
      id: "truncated",
      index: 4,
      title: "切り詰めの跡",
      question: "画面は全体を見せているか？",
      pressed: Boolean(data.totals.truncated),
      level: data.totals.truncated ? "info" : "idle",
      verdict: data.totals.truncated
        ? "サンキー／明細は上位に切り詰め"
        : "この表示範囲では切り詰めなし",
      detail: "件数上限あり。全体額は totals、公式見える化サイトで全件確認。",
      metricLabel: data.totals.truncated ? "truncated" : null,
    },
    {
      id: "methodSkew",
      index: 5,
      title: "方式偏りの跡",
      question: "契約方式が極端に偏っていないか？",
      pressed: Boolean(topMethod && topMethod.share >= 0.55),
      level:
        topMethod && topMethod.share >= 0.75
          ? "caution"
          : topMethod && topMethod.share >= 0.55
            ? "watch"
            : "idle",
      verdict:
        topMethod && topMethod.share >= 0.55
          ? `最多「${topMethod.method}」${pct(topMethod.share)}`
          : topMethod
            ? `最多は「${topMethod.method}」${pct(topMethod.share)}（偏りは緩やか）`
            : "契約方式の集計材料がありません",
      detail: "補助金交付など制度上の偏りも含む。競争入札比率との対比で読む。",
      metricLabel: topMethod ? pct(topMethod.share) : null,
    },
    {
      id: "crossMinistry",
      index: 6,
      title: "府省横断の跡",
      question: "同じ支出先が複数府省に出るか？",
      pressed: cross.length > 0,
      level: cross.some((c) => c.ministries >= 3)
        ? "caution"
        : cross.length > 0
          ? "watch"
          : "idle",
      verdict:
        cross.length > 0
          ? `例:「${cross[0]!.payee}」が ${cross[0]!.ministries} 府省`
          : "表示範囲では府省横断の同一支出先は目立ちません",
      detail: "同一年度・表示行での府省またぎ。年またぎの勢いは支出先詳細（dossier）で。",
      metricLabel: cross[0] ? `${cross[0].ministries}府省` : null,
    },
    {
      id: "singleLine",
      index: 7,
      title: "単線巨額の跡",
      question: "一つの事業に水量が寄っていないか？",
      pressed: Boolean(projectTop && projectTop.share >= 0.35),
      level:
        projectTop && projectTop.share >= 0.55
          ? "caution"
          : projectTop && projectTop.share >= 0.35
            ? "watch"
            : "idle",
      verdict:
        projectTop && projectTop.share >= 0.35
          ? `事業「${projectTop.name.slice(0, 28)}${projectTop.name.length > 28 ? "…" : ""}」${pct(projectTop.share)}`
          : "単一事業への極端な寄りは目立ちません",
      detail: "表示範囲の事業別シェア。府省ドリル後は「その府省の単線」として読む。",
      metricLabel: projectTop ? pct(projectTop.share) : null,
    },
  ];

  return {
    year: data.year,
    unit: data.unit,
    scopeLabel: scopeLabel(data, selectedNode),
    pressedCount: stamps.filter((s) => s.pressed).length,
    stamps,
  };
}
