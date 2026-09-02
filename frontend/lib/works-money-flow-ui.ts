import type { MoneyFlowLink, MoneyFlowNode, MoneyFlowRow } from "@/lib/types/gyosei";

export function nodeDisplayName(node: MoneyFlowNode): string {
  return node.rawLabel ?? node.label.replace(/…$/, "").trim();
}

export function kindLabelJa(kind: MoneyFlowNode["kind"]): string {
  switch (kind) {
    case "government":
      return "政府全体";
    case "ministry":
      return "府省庁";
    case "project":
      return "事業";
    case "payee":
      return "支出先";
    case "block":
      return "ブロック";
    default:
      return kind;
  }
}

export function filterRowsBySelectedNode(
  rows: MoneyFlowRow[],
  node: MoneyFlowNode | null,
): MoneyFlowRow[] {
  if (!node || node.kind === "government") return rows;

  const name = nodeDisplayName(node);
  if (node.kind === "ministry") {
    return rows.filter((row) => row.ministry === node.label || row.ministry === name);
  }
  if (node.kind === "project") {
    return rows.filter(
      (row) =>
        row.project === name ||
        row.project.includes(name) ||
        name.includes(row.project),
    );
  }
  if (node.kind === "payee") {
    return rows.filter(
      (row) =>
        row.payee === name ||
        row.payee.includes(name) ||
        name.includes(row.payee),
    );
  }
  if (node.kind === "block") {
    const block = node.label.replace(/^ブロック\s*/, "");
    return rows.filter((row) => row.block === block);
  }
  return rows;
}

export type NodeSelectionSummary = {
  kindLabel: string;
  name: string;
  nodeAmount: number;
  filteredAmount: number;
  filteredCount: number;
  relatedProjects: string[];
  relatedPayees: string[];
  relatedMinistries: string[];
};

export function buildNodeSelectionSummary(
  node: MoneyFlowNode,
  rows: MoneyFlowRow[],
  links: MoneyFlowLink[],
  nodes: MoneyFlowNode[],
): NodeSelectionSummary {
  const filtered = filterRowsBySelectedNode(rows, node);
  const nodeById = new Map(nodes.map((entry) => [entry.id, entry]));

  const upstream = new Set<string>();
  const downstream = new Set<string>();
  for (const link of links) {
    if (link.source === node.id) downstream.add(link.target);
    if (link.target === node.id) upstream.add(link.source);
  }

  const relatedMinistries = new Set<string>();
  const relatedProjects = new Set<string>();
  const relatedPayees = new Set<string>();

  for (const id of upstream) {
    const related = nodeById.get(id);
    if (!related) continue;
    if (related.kind === "ministry") relatedMinistries.add(nodeDisplayName(related));
    if (related.kind === "project") relatedProjects.add(nodeDisplayName(related));
  }
  for (const id of downstream) {
    const related = nodeById.get(id);
    if (!related) continue;
    if (related.kind === "project") relatedProjects.add(nodeDisplayName(related));
    if (related.kind === "payee") relatedPayees.add(nodeDisplayName(related));
  }

  for (const row of filtered.slice(0, 40)) {
    relatedMinistries.add(row.ministry);
    relatedProjects.add(row.project);
    relatedPayees.add(row.payee);
  }

  return {
    kindLabel: kindLabelJa(node.kind),
    name: nodeDisplayName(node),
    nodeAmount: node.amount,
    filteredAmount: filtered.reduce((sum, row) => sum + row.amount, 0),
    filteredCount: filtered.length,
    relatedMinistries: [...relatedMinistries].slice(0, 6),
    relatedProjects: [...relatedProjects].slice(0, 8),
    relatedPayees: [...relatedPayees].slice(0, 8),
  };
}

export function formatMoneyFlowAmount(value: number, unit: string): string {
  return `${value.toLocaleString("ja-JP")} ${unit}`;
}

/** 選択ノードの上流・下流だけを残す（府省庁・事業・支出先の詳細サンキー） */
function collectFocusedGraphIds(
  focusId: string,
  links: MoneyFlowLink[],
): Set<string> {
  const keepIds = new Set<string>([focusId]);

  const upstreamQueue = [focusId];
  while (upstreamQueue.length > 0) {
    const id = upstreamQueue.pop()!;
    for (const link of links) {
      if (link.target === id && !keepIds.has(link.source)) {
        keepIds.add(link.source);
        upstreamQueue.push(link.source);
      }
    }
  }

  const downstreamQueue = [focusId];
  while (downstreamQueue.length > 0) {
    const id = downstreamQueue.pop()!;
    for (const link of links) {
      if (link.source === id && !keepIds.has(link.target)) {
        keepIds.add(link.target);
        downstreamQueue.push(link.target);
      }
    }
  }

  return keepIds;
}

/** ノード選択時 — 国庫〜支出先の流れを選択範囲だけに絞る */
export function filterSankeyGraph(
  nodes: MoneyFlowNode[],
  links: MoneyFlowLink[],
  focus: MoneyFlowNode | null,
): { nodes: MoneyFlowNode[]; links: MoneyFlowLink[] } {
  if (!focus || focus.kind === "government") {
    return { nodes, links };
  }

  const keepIds = collectFocusedGraphIds(focus.id, links);

  return {
    nodes: nodes.filter((node) => keepIds.has(node.id)),
    links: links.filter(
      (link) => keepIds.has(link.source) && keepIds.has(link.target),
    ),
  };
}

/** 縦軸ノード選択時に詳細サンキーを表示 */
export function resolveSankeyGraphData(
  nodes: MoneyFlowNode[],
  links: MoneyFlowLink[],
  selectedNode: MoneyFlowNode | null,
): { nodes: MoneyFlowNode[]; links: MoneyFlowLink[] } {
  if (selectedNode && selectedNode.kind !== "government") {
    return filterSankeyGraph(nodes, links, selectedNode);
  }
  return { nodes, links };
}

export function sankeyFocusDescription(
  selectedNode: MoneyFlowNode | null,
): string {
  if (!selectedNode || selectedNode.kind === "government") {
    return "各列の総量は同じ高さ · 列内は金額の大きい順 · クリックで詳細表示";
  }
  const name = nodeDisplayName(selectedNode);
  return `${kindLabelJa(selectedNode.kind)}「${name}」の流れ · 事業・支出先は金額の大きい順`;
}
