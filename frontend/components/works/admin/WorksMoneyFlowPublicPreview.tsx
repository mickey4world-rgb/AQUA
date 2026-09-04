"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import PublicPreviewNav from "@/components/public/PublicPreviewNav";
import MoneyFlowSelectionPanel from "@/components/works/admin/MoneyFlowSelectionPanel";
import SankeyDiagram from "@/components/works/admin/SankeyDiagram";
import type { MoneyFlowNode, MoneyFlowResponse } from "@/lib/types/gyosei";
import { PAGE_MAIN_CLASS } from "@/lib/mobile-utils";
import { fetchJsonWithTimeout } from "@/lib/fetch-with-timeout";
import {
  moneyFlowPublicCacheKey,
  readMoneyFlowCache,
  writeMoneyFlowCache,
} from "@/lib/money-flow-client-cache";
import {
  buildNodeSelectionSummary,
  filterRowsBySelectedNode,
  formatMoneyFlowAmount,
  resolveSankeyGraphData,
  sankeyFocusDescription,
} from "@/lib/works-money-flow-ui";

const ROW_PAGE_SIZE = 25;
const PUBLIC_CACHE_KEY = moneyFlowPublicCacheKey();

type WorksMoneyFlowPublicPreviewProps = {
  initialData?: MoneyFlowResponse | null;
};

export default function WorksMoneyFlowPublicPreview({
  initialData = null,
}: WorksMoneyFlowPublicPreviewProps) {
  const [data, setData] = useState<MoneyFlowResponse | null>(
    () => initialData ?? readMoneyFlowCache<MoneyFlowResponse>(PUBLIC_CACHE_KEY),
  );
  const [error, setError] = useState<string | null>(null);
  const [rowPage, setRowPage] = useState(0);
  const [selectedNode, setSelectedNode] = useState<MoneyFlowNode | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (initialData) {
      writeMoneyFlowCache(PUBLIC_CACHE_KEY, initialData);
      return;
    }

    let cancelled = false;
    const cached = readMoneyFlowCache<MoneyFlowResponse>(PUBLIC_CACHE_KEY);
    if (cached) {
      setData(cached);
      // キャッシュがある場合は裏で更新（失敗しても表示は維持）
      setRefreshing(true);
      fetchJsonWithTimeout<MoneyFlowResponse>("/api/public/works-money-flow", {
        timeoutMs: 90_000,
      })
        .then((payload) => {
          if (cancelled) return;
          writeMoneyFlowCache(PUBLIC_CACHE_KEY, payload);
          setData(payload);
          setError(null);
        })
        .catch(() => {
          /* keep cached */
        })
        .finally(() => {
          if (!cancelled) setRefreshing(false);
        });
      return () => {
        cancelled = true;
      };
    }

    fetchJsonWithTimeout<MoneyFlowResponse>("/api/public/works-money-flow", {
      timeoutMs: 90_000,
    })
      .then((payload) => {
        if (cancelled) return;
        writeMoneyFlowCache(PUBLIC_CACHE_KEY, payload);
        setData(payload);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "データの取得に失敗しました");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [initialData]);

  const filteredRows = useMemo(
    () => filterRowsBySelectedNode(data?.rows ?? [], selectedNode),
    [data?.rows, selectedNode],
  );

  const selectionSummary = useMemo(() => {
    if (!data || !selectedNode) return null;
    return buildNodeSelectionSummary(
      selectedNode,
      data.rows,
      data.links,
      data.nodes,
    );
  }, [data, selectedNode]);

  const sankeyGraph = useMemo(
    () =>
      data
        ? resolveSankeyGraphData(data.nodes, data.links, selectedNode)
        : { nodes: [], links: [] },
    [data, selectedNode],
  );

  const pagedRows = useMemo(() => {
    const start = rowPage * ROW_PAGE_SIZE;
    return filteredRows.slice(start, start + ROW_PAGE_SIZE);
  }, [filteredRows, rowPage]);

  const rowPageCount = Math.max(1, Math.ceil(filteredRows.length / ROW_PAGE_SIZE));
  const projectCount = data?.nodes.filter((node) => node.kind === "project").length ?? 0;

  function handleNodeClick(node: MoneyFlowNode) {
    if (node.kind === "government") {
      setSelectedNode(null);
      setRowPage(0);
      return;
    }
    setSelectedNode((current) => (current?.id === node.id ? null : node));
    setRowPage(0);
  }

  return (
    <main className={`${PAGE_MAIN_CLASS} mx-auto w-full max-w-6xl px-4 py-8 sm:px-6`}>
      <PublicPreviewNav showcaseAnchor="sankey" />

      <div className="mb-6">
        <p className="eyebrow">WORKS · 行政事業レビュー</p>
        <h1 className="display-section mt-3 text-white">お金の流れ（無料プレビュー）</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">
          内閣官房「行政事業レビュー」の公開データを、サンキー図と明細で表示します。
          府省庁・事業・支出先をクリックすると詳細と明細が絞り込まれます（AI コストなし）。
          {data ? (
            <>
              {" "}
              {data.year}年度 · 主要事業 {projectCount} 件 · 合計{" "}
              {formatMoneyFlowAmount(data.totals.amount, data.unit)}
              {refreshing ? " · 最新を確認中…" : ""}
            </>
          ) : null}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/works/admin/money-flow"
            className="inline-flex items-center gap-2 rounded-full border border-white/12 px-4 py-2 text-sm text-slate-200 transition hover:border-white/25 hover:bg-white/5"
          >
            ログイン後にフル版（検索・ドリルダウン）
            <span aria-hidden>→</span>
          </Link>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}

      {!data && !error ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-12 text-center text-sm text-slate-500">
          データを読み込み中…
        </div>
      ) : null}

      {data ? (
        <div className="space-y-6">
          <section className="glass-panel overflow-hidden rounded-3xl">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-5 py-4">
              <div>
                <p className="eyebrow">Sankey</p>
                <p className="mt-1 text-sm text-slate-400">
                  {sankeyFocusDescription(selectedNode)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-[10px] text-slate-400">
                {[
                  { label: "国庫", color: "#67e8f9" },
                  { label: "府省庁", color: "#5eead4" },
                  { label: "事業", color: "#a5b4fc" },
                  { label: "支出先", color: "#fcd34d" },
                ].map((item) => (
                  <span key={item.label} className="inline-flex items-center gap-1.5">
                    <span
                      className="h-2 w-2 rounded-sm"
                      style={{ background: item.color }}
                      aria-hidden
                    />
                    {item.label}
                  </span>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto p-2 sm:p-4">
              <SankeyDiagram
                nodes={sankeyGraph.nodes}
                links={sankeyGraph.links}
                unit={data.unit}
                width={1040}
                height={560}
                amountWeightedLinks
                fixedColumns
                selectedNodeId={selectedNode?.id ?? null}
                onNodeClick={handleNodeClick}
              />
            </div>
            {selectionSummary ? (
              <div className="border-t border-white/8 px-4 pb-4 sm:px-5">
                <MoneyFlowSelectionPanel
                  summary={selectionSummary}
                  unit={data.unit}
                  onClear={() => {
                    setSelectedNode(null);
                    setRowPage(0);
                  }}
                />
              </div>
            ) : null}
          </section>

          <section className="glass-panel overflow-hidden rounded-3xl">
            <div className="border-b border-white/8 px-5 py-4">
              <p className="eyebrow">明細</p>
              <p className="mt-1 text-sm text-slate-400">
                {selectedNode
                  ? `${selectionSummary?.kindLabel}「${selectionSummary?.name}」に関連する契約明細`
                  : "契約明細（金額の大きい順）"}
                {" · "}
                {filteredRows.length === 0
                  ? "0"
                  : `${rowPage * ROW_PAGE_SIZE + 1}–${Math.min(
                      (rowPage + 1) * ROW_PAGE_SIZE,
                      filteredRows.length,
                    )}`}{" "}
                / {filteredRows.length} 件
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-white/[0.02] text-[11px] uppercase tracking-[0.14em] text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">府省庁</th>
                    <th className="px-4 py-3 font-medium">事業</th>
                    <th className="px-4 py-3 font-medium">支出先</th>
                    <th className="px-4 py-3 font-medium">ブロック</th>
                    <th className="px-4 py-3 font-medium text-right">金額</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((row, index) => (
                    <tr
                      key={`${row.projectNumber}-${row.payee}-${rowPage}-${index}`}
                      className="border-t border-white/5 text-slate-300"
                    >
                      <td className="px-4 py-3 whitespace-nowrap">{row.ministry}</td>
                      <td className="px-4 py-3 max-w-[16rem] truncate" title={row.project}>
                        {row.project}
                      </td>
                      <td className="px-4 py-3 max-w-[14rem] truncate" title={row.payee}>
                        {row.payee}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-500">{row.block}</td>
                      <td className="px-4 py-3 text-right font-mono text-cyan-100/90 whitespace-nowrap">
                        {formatMoneyFlowAmount(row.amount, data.unit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rowPageCount > 1 ? (
              <div className="flex items-center justify-between border-t border-white/8 px-5 py-3 text-xs text-slate-400">
                <button
                  type="button"
                  disabled={rowPage <= 0}
                  onClick={() => setRowPage((page) => Math.max(0, page - 1))}
                  className="rounded-full border border-white/10 px-3 py-1 disabled:opacity-40"
                >
                  前へ
                </button>
                <span>
                  {rowPage + 1} / {rowPageCount}
                </span>
                <button
                  type="button"
                  disabled={rowPage >= rowPageCount - 1}
                  onClick={() => setRowPage((page) => Math.min(rowPageCount - 1, page + 1))}
                  className="rounded-full border border-white/10 px-3 py-1 disabled:opacity-40"
                >
                  次へ
                </button>
              </div>
            ) : null}
            <div className="border-t border-white/8 px-5 py-3 text-[11px] text-slate-500">
              出典: {data.source.label}（{data.source.license}） ·{" "}
              <a
                href={data.source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-300/80 hover:text-cyan-200"
              >
                {data.source.publisher}
              </a>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
