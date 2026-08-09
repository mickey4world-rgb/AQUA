"use client";

import { useEffect, useMemo, useState } from "react";
import SankeyDiagram from "@/components/works/admin/SankeyDiagram";
import type { MoneyFlowResponse } from "@/lib/types/gyosei";

type MetaResponse = {
  unit: string;
  source: MoneyFlowResponse["source"];
  years: Array<{
    fiscalYear: number;
    total: number;
    projectCount: number;
    flowCount: number;
    ministries: Array<{ name: string; amount: number; projectCount: number }>;
  }>;
  topPayees: Array<{ name: string; amount: number; years: number[] }>;
};

const ALL_MINISTRIES = "政府全体";

type FlowState = {
  key: string;
  data: MoneyFlowResponse | null;
  error: string | null;
};

export default function MoneyFlowPanel() {
  const [meta, setMeta] = useState<MetaResponse | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [ministry, setMinistry] = useState(ALL_MINISTRIES);
  const [payeeInput, setPayeeInput] = useState("");
  const [payee, setPayee] = useState("");
  const [flow, setFlow] = useState<FlowState>({ key: "", data: null, error: null });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/works/money-flow?meta=1")
      .then(async (response) => {
        if (!response.ok) throw new Error("meta");
        return (await response.json()) as MetaResponse;
      })
      .then((payload) => {
        if (cancelled) return;
        setMeta(payload);
        setYear(payload.years[payload.years.length - 1]?.fiscalYear ?? null);
      })
      .catch(() => {
        if (!cancelled) setMetaError("データの読み込みに失敗しました。");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const requestKey = useMemo(
    () => (year == null ? "" : `${year}|${ministry}|${payee}`),
    [year, ministry, payee],
  );

  useEffect(() => {
    if (!requestKey) return;
    let cancelled = false;
    fetchFlow(requestKey)
      .then((payload) => {
        if (cancelled) return;
        setFlow({ key: requestKey, data: payload, error: null });
      })
      .catch(() => {
        if (cancelled) return;
        setFlow({ key: requestKey, data: null, error: "お金の流れの取得に失敗しました。" });
      });
    return () => {
      cancelled = true;
    };
  }, [requestKey]);

  const data = flow.key === requestKey ? flow.data : null;
  const loading = Boolean(requestKey) && flow.key !== requestKey;
  const error = metaError ?? (flow.key === requestKey ? flow.error : null);

  const ministries =
    data?.ministries ??
    meta?.years.flatMap((entry) => entry.ministries.map((item) => item.name)) ??
    [];
  const uniqueMinistries = [...new Set(ministries)].sort((a, b) =>
    a.localeCompare(b, "ja"),
  );

  return (
    <div className="space-y-5">
      <section className="glass-panel rounded-3xl p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">行政事業レビュー</p>
            <h2 className="display-sub mt-2 text-white">お金の流れ</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
              公開されている主要事項データベースをもとに、政府 → 府省庁 → 事業 → 支出先の流れをサンキー図で見ます。
              支出先の企業名で絞ると、いつ・どこから・いくら入ったかが追えます。
            </p>
          </div>
          {data && (
            <div className="text-right">
              <p className="font-mono text-2xl text-cyan-100">
                {formatTrillion(data.totals.amount)}
              </p>
              <p className="mt-1 text-[11px] tracking-wide text-slate-500">
                {data.year}年度 / {data.unit}
              </p>
            </div>
          )}
        </div>

        <form
          className="mt-6 grid gap-3 md:grid-cols-[140px_minmax(0,1fr)_minmax(0,1.2fr)_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            setPayee(payeeInput.trim());
          }}
        >
          <label className="block text-xs text-slate-400">
            年度
            <select
              value={year ?? ""}
              onChange={(event) => setYear(Number(event.target.value))}
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-cyan-300/40"
            >
              {(meta?.years ?? []).map((entry) => (
                <option key={entry.fiscalYear} value={entry.fiscalYear}>
                  {entry.fiscalYear}年度
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs text-slate-400">
            府省庁
            <select
              value={ministry}
              onChange={(event) => setMinistry(event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-cyan-300/40"
            >
              <option value={ALL_MINISTRIES}>{ALL_MINISTRIES}</option>
              {uniqueMinistries.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs text-slate-400">
            支出先（企業名・団体名）
            <input
              value={payeeInput}
              onChange={(event) => setPayeeInput(event.target.value)}
              placeholder="例: 電通 / 富士通 / 日本郵便"
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-cyan-300/40"
            />
          </label>

          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="rounded-xl bg-gradient-to-r from-cyan-300/90 to-teal-200/90 px-4 py-2.5 text-sm font-medium text-slate-950 transition hover:from-cyan-200 hover:to-teal-100"
            >
              絞り込む
            </button>
            {(ministry !== ALL_MINISTRIES || payee) && (
              <button
                type="button"
                onClick={() => {
                  setMinistry(ALL_MINISTRIES);
                  setPayeeInput("");
                  setPayee("");
                }}
                className="rounded-xl border border-white/12 px-3 py-2.5 text-sm text-slate-300 transition hover:bg-white/5"
              >
                解除
              </button>
            )}
          </div>
        </form>

        {meta && (
          <div className="mt-4 flex flex-wrap gap-2">
            {meta.topPayees.slice(0, 8).map((entry) => (
              <button
                key={entry.name}
                type="button"
                onClick={() => {
                  setPayeeInput(entry.name);
                  setPayee(entry.name);
                }}
                className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] text-slate-300 transition hover:border-cyan-300/30 hover:text-cyan-100"
              >
                {entry.name}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="glass-panel rounded-3xl p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow">Sankey</p>
            <p className="mt-1 text-sm text-slate-400">
              {loading
                ? "集計中…"
                : data
                  ? `${data.totals.flowCount.toLocaleString("ja-JP")} 件の支出 / 事業 ${data.totals.projectCount.toLocaleString("ja-JP")} / 支出先 ${data.totals.payeeCount.toLocaleString("ja-JP")}`
                  : "—"}
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-[11px] text-slate-500">
            <LegendDot color="#67e8f9" label="政府" />
            <LegendDot color="#5eead4" label="府省庁" />
            <LegendDot color="#a5b4fc" label="事業" />
            <LegendDot color="#fcd34d" label="支出先" />
          </div>
        </div>

        {error && (
          <p className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </p>
        )}

        {!error && data && (
          <SankeyDiagram nodes={data.nodes} links={data.links} unit={data.unit} />
        )}

        {data?.totals.truncated && (
          <p className="mt-3 text-xs text-slate-500">
            見やすさのため上位の流れに絞っています。府省庁や企業名で絞り込むと細部まで見えます。
          </p>
        )}
      </section>

      {data && data.rows.length > 0 && (
        <section className="glass-panel overflow-hidden rounded-3xl">
          <div className="border-b border-white/8 px-5 py-4 sm:px-6">
            <p className="eyebrow">明細</p>
            <p className="mt-1 text-sm text-slate-400">
              金額の大きい順（最大 {data.rows.length} 件）
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
                {data.rows.map((row, index) => (
                  <tr
                    key={`${row.projectNumber}-${row.payee}-${index}`}
                    className="border-t border-white/5 text-slate-300"
                  >
                    <td className="px-4 py-3 whitespace-nowrap">{row.ministry}</td>
                    <td className="px-4 py-3">
                      <div className="max-w-[16rem] truncate" title={row.project}>
                        {row.project}
                      </div>
                      {row.work && (
                        <div
                          className="mt-1 max-w-[18rem] truncate text-xs text-slate-500"
                          title={row.work}
                        >
                          {row.work}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => {
                          setPayeeInput(row.payee);
                          setPayee(row.payee);
                        }}
                        className="text-left text-cyan-100/90 transition hover:text-cyan-50"
                      >
                        {row.payee}
                      </button>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">
                      {row.block}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-cyan-50/90 whitespace-nowrap">
                      {formatAmount(row.amount)} {data.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {data && (
        <p className="px-1 text-[11px] leading-relaxed text-slate-600">
          出典: {data.source.publisher}「{data.source.label}」（{data.source.license}） /{" "}
          <a
            href={data.source.url}
            target="_blank"
            rel="noreferrer"
            className="underline decoration-white/20 underline-offset-2 hover:text-slate-400"
          >
            {data.source.url}
          </a>
          。一部事業は原データの単位入力が疑わしいため集計から除外しています。
        </p>
      )}
    </div>
  );
}

async function fetchFlow(key: string): Promise<MoneyFlowResponse> {
  const [yearText, ministryText, payeeText] = key.split("|");
  const params = new URLSearchParams({ year: yearText });
  if (ministryText && ministryText !== ALL_MINISTRIES) {
    params.set("ministry", ministryText);
  }
  if (payeeText) params.set("payee", payeeText);
  const response = await fetch(`/api/works/money-flow?${params}`);
  if (!response.ok) throw new Error("flow");
  return (await response.json()) as MoneyFlowResponse;
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function formatAmount(value: number): string {
  return value.toLocaleString("ja-JP", { maximumFractionDigits: 1 });
}

function formatTrillion(value: number): string {
  return `${(value / 1_000_000).toFixed(2)} 兆円`;
}
