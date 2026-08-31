"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import type { MoneyFlowResponse } from "@/lib/types/gyosei";
import { PAGE_MAIN_CLASS } from "@/lib/mobile-utils";

const SankeyDiagram = dynamic(
  () => import("@/components/works/admin/SankeyDiagram"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[420px] items-center justify-center rounded-2xl border border-white/10 bg-white/[0.02] text-sm text-slate-500">
        サンキー図を描画中…
      </div>
    ),
  },
);

const ROW_PAGE_SIZE = 25;

function formatAmount(value: number, unit: string): string {
  return `${value.toLocaleString("ja-JP")} ${unit}`;
}

export default function WorksMoneyFlowPublicPreview() {
  const [data, setData] = useState<MoneyFlowResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rowPage, setRowPage] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/public/works-money-flow")
      .then(async (response) => {
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? "データの取得に失敗しました");
        }
        return (await response.json()) as MoneyFlowResponse;
      })
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "データの取得に失敗しました");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const pagedRows = useMemo(() => {
    const rows = data?.rows ?? [];
    const start = rowPage * ROW_PAGE_SIZE;
    return rows.slice(start, start + ROW_PAGE_SIZE);
  }, [data?.rows, rowPage]);

  const rowPageCount = Math.max(1, Math.ceil((data?.rows.length ?? 0) / ROW_PAGE_SIZE));
  const projectCount = data?.nodes.filter((node) => node.kind === "project").length ?? 0;

  return (
    <main className={`${PAGE_MAIN_CLASS} mx-auto w-full max-w-6xl px-4 py-8 sm:px-6`}>
      <div className="mb-6">
        <p className="eyebrow">WORKS · 行政事業レビュー</p>
        <h1 className="display-section mt-3 text-white">お金の流れ（無料プレビュー）</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">
          内閣官房「行政事業レビュー」の公開データを、サンキー図と明細で表示します。
          2列目=府省庁、3列目=主要事業、最右列=支出先。AI コストはかかりません。
          {data ? (
            <>
              {" "}
              {data.year}年度 · 主要事業 {projectCount} 件 · 合計{" "}
              {formatAmount(data.totals.amount, data.unit)}
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
          <Link
            href="/#sankey"
            className="inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-100 transition hover:bg-cyan-500/20"
          >
            Showcase に戻る
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
                  政府全体 → 府省庁 → 主要事業 → 支出先
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
                nodes={data.nodes}
                links={data.links}
                unit={data.unit}
                width={960}
                height={560}
                amountWeightedLinks
                fixedColumns
              />
            </div>
          </section>

          <section className="glass-panel overflow-hidden rounded-3xl">
            <div className="border-b border-white/8 px-5 py-4">
              <p className="eyebrow">明細</p>
              <p className="mt-1 text-sm text-slate-400">
                契約明細（金額の大きい順） ·{" "}
                {data.rows.length === 0
                  ? "0"
                  : `${rowPage * ROW_PAGE_SIZE + 1}–${Math.min(
                      (rowPage + 1) * ROW_PAGE_SIZE,
                      data.rows.length,
                    )}`}{" "}
                / {data.rows.length} 件
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
                        {formatAmount(row.amount, data.unit)}
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
