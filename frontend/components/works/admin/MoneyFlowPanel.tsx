"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchJsonWithTimeout } from "@/lib/fetch-with-timeout";
import {
  moneyFlowMetaCacheKey,
  moneyFlowQueryCacheKey,
  readMoneyFlowCache,
  writeMoneyFlowCache,
} from "@/lib/money-flow-client-cache";
import MoneyFlowSelectionPanel from "@/components/works/admin/MoneyFlowSelectionPanel";
import SankeyDiagram from "@/components/works/admin/SankeyDiagram";
import type {
  MoneyFlowFocusKind,
  MoneyFlowNode,
  MoneyFlowResponse,
  PayeeDossier,
} from "@/lib/types/gyosei";
import {
  buildNodeSelectionSummary,
  filterRowsBySelectedNode,
  resolveSankeyGraphData,
  sankeyFocusDescription,
} from "@/lib/works-money-flow-ui";

type MetaResponse = {
  unit: string;
  source: MoneyFlowResponse["source"];
  years: Array<{
    fiscalYear: number;
    total: number;
    projectCount: number;
    flowCount: number;
    available: boolean;
    ministries: Array<{ name: string; amount: number; projectCount: number }>;
  }>;
  pendingYears: Array<{ fiscalYear: number; available: boolean }>;
  sectors: Array<{ id: string; label: string }>;
  topPayees: Array<{ name: string; amount: number; years: number[] }>;
  houjinEnabled: boolean;
};

const ALL_MINISTRIES = "政府全体";

type DrillStep = {
  kind: MoneyFlowFocusKind;
  value: string;
  label: string;
};

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
  const [sector, setSector] = useState("");
  const [payeeInput, setPayeeInput] = useState("");
  const [payee, setPayee] = useState("");
  const [drill, setDrill] = useState<DrillStep[]>([]);
  const [flow, setFlow] = useState<FlowState>({ key: "", data: null, error: null });
  const [dossier, setDossier] = useState<PayeeDossier | null>(null);
  const [dossierLoading, setDossierLoading] = useState(false);
  const [dossierError, setDossierError] = useState<string | null>(null);
  const [rowPage, setRowPage] = useState(0);
  const [selectedNode, setSelectedNode] = useState<MoneyFlowNode | null>(null);

  useEffect(() => {
    let cancelled = false;
    const metaKey = moneyFlowMetaCacheKey();
    const cachedMeta = readMoneyFlowCache<MetaResponse>(metaKey);
    if (cachedMeta) {
      setMeta(cachedMeta);
      setYear(cachedMeta.years[cachedMeta.years.length - 1]?.fiscalYear ?? null);
    }

    fetchJsonWithTimeout<MetaResponse>("/api/works/money-flow?meta=1", {
      timeoutMs: 90_000,
    })
      .then((payload) => {
        if (cancelled) return;
        writeMoneyFlowCache(metaKey, payload);
        setMeta(payload);
        setYear(payload.years[payload.years.length - 1]?.fiscalYear ?? null);
        setMetaError(null);
      })
      .catch(() => {
        if (!cancelled && !cachedMeta) {
          setMetaError("データの読み込みに失敗しました。");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const focus = drill[drill.length - 1] ?? null;

  const requestKey = useMemo(() => {
    if (year == null) return "";
    return [
      year,
      ministry,
      payee,
      sector,
      focus?.kind ?? "",
      focus?.value ?? "",
    ].join("|");
  }, [year, ministry, payee, sector, focus]);

  useEffect(() => {
    if (!requestKey) return;
    let cancelled = false;
    setRowPage(0);
    setSelectedNode(null);

    const [yearText, ministryText, payeeText, sectorText, focusKind, focusValue] =
      requestKey.split("|");
    const cacheKey = moneyFlowQueryCacheKey({
      year: yearText,
      ministry: ministryText,
      payee: payeeText,
      sector: sectorText,
      focusKind,
      focusValue,
    });
    const cached = readMoneyFlowCache<MoneyFlowResponse>(cacheKey);
    if (cached) {
      setFlow({ key: requestKey, data: cached, error: null });
    }

    fetchFlow(requestKey)
      .then((payload) => {
        if (cancelled) return;
        writeMoneyFlowCache(cacheKey, payload);
        setFlow({ key: requestKey, data: payload, error: null });
      })
      .catch(() => {
        if (cancelled) return;
        if (cached) return;
        setFlow({
          key: requestKey,
          data: null,
          error: "お金の流れの取得に失敗しました。",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [requestKey]);

  const data = flow.key === requestKey ? flow.data : null;
  const loading = Boolean(requestKey) && flow.key !== requestKey;
  const error = metaError ?? (flow.key === requestKey ? flow.error : null);

  const yearOptions = useMemo(() => {
    const loaded = (meta?.years ?? []).map((entry) => ({
      fiscalYear: entry.fiscalYear,
      available: true as boolean,
    }));
    const pending = (meta?.pendingYears ?? []).map((entry) => ({
      fiscalYear: entry.fiscalYear,
      available: false as boolean,
    }));
    return [...loaded, ...pending].sort((a, b) => a.fiscalYear - b.fiscalYear);
  }, [meta]);

  const ministries =
    data?.ministries ??
    meta?.years.flatMap((entry) => entry.ministries.map((item) => item.name)) ??
    [];
  const uniqueMinistries = [...new Set(ministries)].sort((a, b) =>
    a.localeCompare(b, "ja"),
  );

  function handleNodeClick(node: MoneyFlowNode) {
    if (node.kind === "government") {
      setSelectedNode(null);
      setRowPage(0);
      return;
    }
    if (node.drillable === false) {
      setSelectedNode(node);
      setRowPage(0);
      return;
    }

    setSelectedNode(node);
    setRowPage(0);

    if (node.kind === "ministry") {
      setMinistry(node.label);
      setDrill([{ kind: "ministry", value: node.label, label: node.label }]);
      return;
    }
    if (node.kind === "project") {
      const value = node.rawLabel ?? node.label.replace(/…$/, "");
      setDrill((prev) => [
        ...prev.filter((step) => step.kind !== "project" && step.kind !== "payee" && step.kind !== "block"),
        { kind: "project", value, label: node.label },
      ]);
      return;
    }
    if (node.kind === "block") {
      const block = node.label.replace(/^ブロック\s*/, "");
      setDrill((prev) => [
        ...prev.filter((step) => step.kind !== "block" && step.kind !== "payee"),
        { kind: "block", value: block, label: `ブロック ${block}` },
      ]);
      return;
    }
    if (node.kind === "payee") {
      const value = node.rawLabel ?? node.label.replace(/…$/, "");
      setPayeeInput(value);
      setPayee(value);
      setDrill((prev) => [
        ...prev.filter((step) => step.kind !== "payee"),
        { kind: "payee", value, label: node.label },
      ]);
    }
  }

  async function openPayeeDetail(name: string) {
    setDossier(null);
    setDossierError(null);
    setDossierLoading(true);
    try {
      const response = await fetch(
        `/api/works/money-flow/payee?name=${encodeURIComponent(name)}`,
      );
      if (!response.ok) throw new Error("dossier");
      setDossier((await response.json()) as PayeeDossier);
    } catch {
      setDossierError("支出先の詳細を取得できませんでした。");
    } finally {
      setDossierLoading(false);
    }
  }

  const rowsAreAggregated = Boolean(data?.rows.some((row) => row.aggregated));
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
  const ROW_PAGE_SIZE = 20;
  const pagedRows = useMemo(() => {
    const start = rowPage * ROW_PAGE_SIZE;
    return filteredRows.slice(start, start + ROW_PAGE_SIZE);
  }, [filteredRows, rowPage]);
  const rowPageCount = Math.max(1, Math.ceil(filteredRows.length / ROW_PAGE_SIZE));

  return (
    <div className="space-y-5">
      <section className="glass-panel rounded-3xl p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">行政事業レビュー</p>
            <h2 className="display-sub mt-2 text-white">お金の流れ</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
              ノードをクリックすると一段深いサンキーに入れます。支出先は企業名だけでなく、コンサルなどの分野でも探せます。
            </p>
          </div>
          {data?.yearAvailable && (
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
          className="mt-6 grid gap-3 lg:grid-cols-[120px_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1.1fr)_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            setDrill([]);
            setPayee(payeeInput.trim());
          }}
        >
          <label className="block text-xs text-slate-400">
            年度
            <select
              value={year ?? ""}
              onChange={(event) => {
                setYear(Number(event.target.value));
                setDrill([]);
              }}
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-cyan-300/40"
            >
              {yearOptions.map((entry) => (
                <option key={entry.fiscalYear} value={entry.fiscalYear}>
                  {entry.fiscalYear}年度{entry.available ? "" : "（未収録）"}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs text-slate-400">
            府省庁
            <select
              value={ministry}
              onChange={(event) => {
                setMinistry(event.target.value);
                setDrill(
                  event.target.value === ALL_MINISTRIES
                    ? []
                    : [{ kind: "ministry", value: event.target.value, label: event.target.value }],
                );
              }}
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
            分野
            <select
              value={sector}
              onChange={(event) => {
                setSector(event.target.value);
                setDrill([]);
              }}
              className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-cyan-300/40"
            >
              <option value="">すべて</option>
              {(meta?.sectors ?? data?.sectors ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs text-slate-400">
            支出先（企業名・分野キーワード）
            <input
              value={payeeInput}
              onChange={(event) => setPayeeInput(event.target.value)}
              placeholder="例: 電通 / コンサル / 富士通"
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
            {(ministry !== ALL_MINISTRIES || payee || sector || drill.length > 0) && (
              <button
                type="button"
                onClick={() => {
                  setMinistry(ALL_MINISTRIES);
                  setPayeeInput("");
                  setPayee("");
                  setSector("");
                  setDrill([]);
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
            {(meta.sectors ?? []).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setSector(item.id);
                  setDrill([]);
                }}
                className={`rounded-full border px-3 py-1 text-[11px] transition ${
                  sector === item.id
                    ? "border-cyan-300/40 bg-cyan-400/15 text-cyan-50"
                    : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-cyan-300/30"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </section>

      {drill.length > 0 && (
        <nav className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <button
            type="button"
            onClick={() => {
              setDrill([]);
              setMinistry(ALL_MINISTRIES);
              setSelectedNode(null);
              setRowPage(0);
            }}
            className="rounded-full border border-white/10 px-3 py-1 hover:bg-white/5"
          >
            政府全体
          </button>
          {drill.map((step, index) => (
            <span key={`${step.kind}-${step.value}`} className="inline-flex items-center gap-2">
              <span className="text-slate-600">/</span>
              <button
                type="button"
                onClick={() => setDrill(drill.slice(0, index + 1))}
                className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-cyan-50 hover:bg-cyan-400/15"
              >
                {step.label}
              </button>
            </span>
          ))}
        </nav>
      )}

      <section className="glass-panel rounded-3xl p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow">Sankey</p>
            <p className="mt-1 text-sm text-slate-400">
              {loading
                ? "集計中…"
                : data?.yearAvailable
                  ? sankeyFocusDescription(selectedNode)
                  : data?.message ?? "—"}
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-[11px] text-slate-500">
            <LegendDot color="#67e8f9" label="政府" />
            <LegendDot color="#5eead4" label="府省庁" />
            <LegendDot color="#a5b4fc" label="事業" />
            <LegendDot color="#c4b5fd" label="ブロック" />
            <LegendDot color="#fcd34d" label="支出先" />
          </div>
        </div>

        {error && (
          <p className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </p>
        )}

        {!error && data && !data.yearAvailable && (
          <div className="rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-4 text-sm text-amber-50">
            <p>{data.message}</p>
            <p className="mt-2 text-xs text-amber-100/70">
              取込手順は <code className="font-mono">frontend/data/gyosei/README.md</code> を参照。
            </p>
          </div>
        )}

        {!error && data?.yearAvailable && (
          <>
            <SankeyDiagram
              nodes={sankeyGraph.nodes}
              links={sankeyGraph.links}
              unit={data.unit}
              width={1040}
              height={Math.max(560, Math.min(980, sankeyGraph.nodes.length * 30))}
              fixedColumns
              amountWeightedLinks
              selectedNodeId={selectedNode?.id ?? null}
              onNodeClick={handleNodeClick}
            />
            {selectionSummary ? (
              <div className="mt-4">
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
          </>
        )}

        {data?.totals.truncated && (
          <p className="mt-3 text-xs text-slate-500">
            見やすさのため上位の流れに絞っています。ノードをクリックするか、条件を絞ると細部まで見えます。
          </p>
        )}
      </section>

      {data && data.externalCompanies.length > 0 && (
        <section className="glass-panel rounded-3xl p-5 sm:p-6">
          <p className="eyebrow">企業情報</p>
          <h3 className="display-sub mt-2 text-white">検索した支出先</h3>
          <p className="mt-2 text-sm text-slate-400">
            レビュー実績の大きい順。詳細では受注の勢い・契約の相手・調達上の注意点を見られます。
          </p>
          <ul className="mt-4 space-y-3">
            {data.externalCompanies.map((company) => (
              <li
                key={`${company.corporateNumber}-${company.name}-${company.address}`}
                className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-white">{company.name}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {company.address || "住所情報なし"}
                    </p>
                    {company.addressSource && company.address && (
                      <p className="mt-1 text-[11px] text-slate-500">
                        出典:{" "}
                        {company.addressSource === "review"
                          ? "行政事業レビュー"
                          : company.addressSource === "openstreetmap"
                            ? "OpenStreetMap"
                            : "法人番号公表サイト"}
                      </p>
                    )}
                    {company.corporateNumber && (
                      <p className="mt-1 font-mono text-[11px] text-slate-500">
                        法人番号 {company.corporateNumber}
                      </p>
                    )}
                  </div>
                  <div className="text-right text-xs">
                    {company.inReviewData ? (
                      <p className="text-cyan-100">
                        レビュー実績 {formatAmount(company.reviewAmount)} 百万円
                      </p>
                    ) : (
                      <p className="text-amber-100/80">レビュー実績なし</p>
                    )}
                    <div className="mt-2 flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => void openPayeeDetail(company.name)}
                        className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-cyan-50 hover:bg-cyan-300/15"
                      >
                        詳細
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPayeeInput(company.name);
                          setPayee(company.name);
                          setDrill([
                            { kind: "payee", value: company.name, label: company.name },
                          ]);
                        }}
                        className="rounded-full border border-white/12 px-3 py-1 text-slate-300 hover:bg-white/5"
                      >
                        この企業で絞る
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data && data.nearbyMunicipal.length > 0 && (
        <section className="glass-panel rounded-3xl p-5 sm:p-6">
          <p className="eyebrow">付近の自治体</p>
          <h3 className="display-sub mt-2 text-white">周辺自治体と当該業者</h3>
          <p className="mt-2 text-sm text-slate-400">
            住所近辺の自治体が支出先として入っている国の事業で、同じ事業から当該業者へも支出があるものを拾っています（地方単独の発注データではありません）。
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-medium">自治体</th>
                  <th className="px-3 py-2 font-medium">業者</th>
                  <th className="px-3 py-2 font-medium text-right">自治体向け</th>
                  <th className="px-3 py-2 font-medium text-right">業者向け</th>
                  <th className="px-3 py-2 font-medium">関係</th>
                </tr>
              </thead>
              <tbody>
                {data.nearbyMunicipal.map((row) => (
                  <tr
                    key={`${row.municipality}-${row.vendor}`}
                    className="border-t border-white/5 text-slate-300"
                  >
                    <td className="px-3 py-2 whitespace-nowrap">{row.municipality}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="text-left text-cyan-100/90 hover:text-cyan-50"
                        onClick={() => void openPayeeDetail(row.vendor)}
                      >
                        {row.vendor}
                      </button>
                      {row.topProjects[0] && (
                        <div className="mt-1 max-w-[16rem] truncate text-xs text-slate-500" title={row.topProjects.join(" / ")}>
                          {row.topProjects[0]}
                          {row.projectCount > 1 ? ` 他${row.projectCount - 1}` : ""}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-cyan-50/90 whitespace-nowrap">
                      {formatAmount(row.municipalityAmount)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-cyan-50/90 whitespace-nowrap">
                      {formatAmount(row.vendorAmount)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-500">
                      {row.relation === "same-project" ? "同一事業" : "契約概要で言及"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {data && data.yearAvailable && data.rows.length > 0 && (
        <section className="glass-panel overflow-hidden rounded-3xl">
          <div className="border-b border-white/8 px-5 py-4 sm:px-6">
            <p className="eyebrow">明細</p>
            <p className="mt-1 text-sm text-slate-400">
              {selectedNode && selectionSummary
                ? `${selectionSummary.kindLabel}「${selectionSummary.name}」に関連する明細`
                : rowsAreAggregated
                  ? `支出先ごとの合計（金額の大きい順）`
                  : `契約明細（金額の大きい順）`}
              {" · "}
              {(filteredRows.length === 0
                ? "0"
                : `${rowPage * ROW_PAGE_SIZE + 1}–${Math.min(
                    (rowPage + 1) * ROW_PAGE_SIZE,
                    filteredRows.length,
                  )}`) + ` / ${filteredRows.length} 件`}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-white/[0.02] text-[11px] uppercase tracking-[0.14em] text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">府省庁</th>
                  <th className="px-4 py-3 font-medium">事業</th>
                  <th className="px-4 py-3 font-medium">支出先</th>
                  <th className="px-4 py-3 font-medium">{rowsAreAggregated ? "件数" : "ブロック"}</th>
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
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() =>
                          setDrill([
                            ...(ministry !== ALL_MINISTRIES
                              ? [{ kind: "ministry" as const, value: row.ministry, label: row.ministry }]
                              : []),
                            { kind: "project", value: row.project, label: row.project },
                          ])
                        }
                        className="max-w-[16rem] truncate text-left text-cyan-100/90 hover:text-cyan-50"
                        title={row.project}
                      >
                        {row.project}
                      </button>
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
                          setDrill([
                            { kind: "payee", value: row.payee, label: row.payee },
                          ]);
                        }}
                        className="text-left text-cyan-100/90 transition hover:text-cyan-50"
                      >
                        {row.payee}
                      </button>
                      {row.address && (
                        <div
                          className="mt-1 max-w-[16rem] truncate text-xs text-slate-500"
                          title={row.address}
                        >
                          {row.address}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => void openPayeeDetail(row.payee)}
                        className="mt-2 rounded-full border border-white/12 px-2.5 py-0.5 text-[11px] text-slate-400 hover:bg-white/5 hover:text-slate-200"
                      >
                        詳細
                      </button>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">
                      {rowsAreAggregated ? `${row.flowCount ?? "—"}` : row.block}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-cyan-50/90 whitespace-nowrap">
                      {formatAmount(row.amount)} {data.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.rows.length > ROW_PAGE_SIZE && (
            <div className="flex items-center justify-between gap-3 border-t border-white/8 px-5 py-3 sm:px-6">
              <button
                type="button"
                disabled={rowPage <= 0}
                onClick={() => setRowPage((page) => Math.max(0, page - 1))}
                className="rounded-full border border-white/12 px-3 py-1 text-xs text-slate-300 disabled:opacity-30 hover:bg-white/5"
              >
                前の20件
              </button>
              <p className="text-xs text-slate-500">
                {rowPage + 1} / {rowPageCount} ページ
              </p>
              <button
                type="button"
                disabled={rowPage >= rowPageCount - 1}
                onClick={() => setRowPage((page) => Math.min(rowPageCount - 1, page + 1))}
                className="rounded-full border border-white/12 px-3 py-1 text-xs text-slate-300 disabled:opacity-30 hover:bg-white/5"
              >
                次の20件
              </button>
            </div>
          )}
        </section>
      )}

      {(dossierLoading || dossier || dossierError) && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 px-4 pb-8 pt-8 sm:pt-12">
          <div
            role="dialog"
            aria-modal="true"
            className="glass-panel my-0 max-h-[min(88vh,920px)] w-full max-w-3xl overflow-y-auto rounded-3xl p-5 sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow">支出先詳細</p>
                <h3 className="display-sub mt-2 text-white">
                  {dossier?.name ?? (dossierLoading ? "読み込み中…" : "詳細")}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDossier(null);
                  setDossierError(null);
                  setDossierLoading(false);
                }}
                className="rounded-full border border-white/12 px-3 py-1 text-xs text-slate-300 hover:bg-white/5"
              >
                閉じる
              </button>
            </div>

            {dossierLoading && (
              <p className="mt-6 text-sm text-slate-400">
                レビュー集計と、指名停止・百科・株価の公開情報を調べています…
              </p>
            )}
            {dossierError && <p className="mt-6 text-sm text-rose-200">{dossierError}</p>}

            {dossier && (
              <div className="mt-5 space-y-5">
                <p className="text-sm text-slate-400">
                  {dossier.address || "住所情報なし"}
                  {dossier.corporateNumber
                    ? ` / 法人番号 ${dossier.corporateNumber}`
                    : ""}
                </p>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                    <p className="text-[11px] tracking-wide text-slate-500">受注の勢い</p>
                    <p className="mt-1 text-lg text-cyan-50">{dossier.trend.label}</p>
                    <p className="mt-2 text-xs leading-relaxed text-slate-400">
                      {dossier.trend.summary}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                    <p className="text-[11px] tracking-wide text-slate-500">調達判断</p>
                    <p className="mt-1 text-lg text-cyan-50">{dossier.procurement.verdict}</p>
                    <p className="mt-2 text-xs leading-relaxed text-slate-400">
                      {dossier.procurement.summary}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                    <p className="text-[11px] tracking-wide text-slate-500">累計（レビュー）</p>
                    <p className="mt-1 font-mono text-lg text-cyan-50">
                      {formatAmount(dossier.totalAmount)} {dossier.unit}
                    </p>
                    <p className="mt-2 text-xs text-slate-400">
                      ※企業会計の黒字・赤字ではなく、国からの支出推移の代理指標です。
                    </p>
                  </div>
                </div>

                <div>
                  <p className="text-xs tracking-wide text-slate-500">年度別の国からの支出</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {dossier.years.map((point) => (
                      <div
                        key={point.fiscalYear}
                        className="rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-300"
                      >
                        <span className="text-slate-500">{point.fiscalYear}</span>{" "}
                        <span className="font-mono text-cyan-50">
                          {formatAmount(point.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs tracking-wide text-slate-500">問題点・注意点</p>
                  <ul className="mt-2 space-y-2">
                    {dossier.issues.map((issue) => (
                      <li
                        key={issue.title}
                        className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3"
                      >
                        <p className="text-sm text-white">
                          <span
                            className={
                              issue.level === "caution"
                                ? "text-rose-200"
                                : issue.level === "watch"
                                  ? "text-amber-100"
                                  : "text-cyan-100"
                            }
                          >
                            {issue.level === "caution"
                              ? "注意"
                              : issue.level === "watch"
                                ? "確認"
                                : "参考"}
                          </span>
                          {" · "}
                          {issue.title}
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-slate-400">
                          {issue.detail}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <p className="text-xs tracking-wide text-slate-500">
                    指名停止（国交省ネガティブ情報・直近5年）
                  </p>
                  {(dossier.suspensions?.length ?? 0) === 0 ? (
                    <p className="mt-2 text-xs text-slate-500">
                      該当なし（他省庁・自治体の措置は含まれません）。
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {dossier.suspensions!.map((row) => (
                        <li
                          key={`${row.date}-${row.company}-${row.agency}`}
                          className="rounded-2xl border border-rose-300/20 bg-rose-300/[0.04] px-4 py-3 text-sm text-slate-300"
                        >
                          <p className="text-rose-100">
                            {row.date} · {row.type}
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            {row.agency} / {row.company}
                            {row.address ? `（${row.address}）` : ""}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
                            {row.overviewUrl && (
                              <a
                                href={row.overviewUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="underline decoration-white/20 underline-offset-2 hover:text-slate-200"
                              >
                                概要
                              </a>
                            )}
                            {row.detailUrl && (
                              <a
                                href={row.detailUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="underline decoration-white/20 underline-offset-2 hover:text-slate-200"
                              >
                                詳細PDF
                              </a>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3">
                    <p className="text-[11px] tracking-wide text-slate-500">日本での評価（Wikipedia）</p>
                    <p className="mt-1 text-sm text-white">
                      {dossier.reputation?.japanTitle || "記事なし"}
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-slate-400">
                      {dossier.reputation?.japanSummary || "日本語Wikipediaの要約を取得できませんでした。"}
                    </p>
                    {dossier.reputation?.japanUrl && (
                      <a
                        href={dossier.reputation.japanUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-block text-[11px] text-cyan-100/80 underline decoration-white/20 underline-offset-2"
                      >
                        出典を開く
                      </a>
                    )}
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3">
                    <p className="text-[11px] tracking-wide text-slate-500">世界での評価（Wikipedia EN）</p>
                    <p className="mt-1 text-sm text-white">
                      {dossier.reputation?.worldTitle || "記事なし"}
                    </p>
                    <p className="mt-2 text-xs leading-relaxed text-slate-400">
                      {dossier.reputation?.worldSummary || "英語Wikipediaの要約を取得できませんでした。"}
                    </p>
                    {dossier.reputation?.worldUrl && (
                      <a
                        href={dossier.reputation.worldUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-block text-[11px] text-cyan-100/80 underline decoration-white/20 underline-offset-2"
                      >
                        出典を開く
                      </a>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3">
                  <p className="text-[11px] tracking-wide text-slate-500">財務的な心配（上場株価）</p>
                  <p className="mt-1 text-sm text-white">
                    {dossier.finance?.concern ? "心配あり" : dossier.finance?.symbol ? "大きな毀損は見えず" : "未上場または未特定"}
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-slate-400">
                    {dossier.finance?.summary}
                  </p>
                </div>

                <div>
                  <p className="text-xs tracking-wide text-slate-500">主な契約相手（府省庁）</p>
                  <ul className="mt-2 space-y-1 text-sm text-slate-300">
                    {dossier.partners.map((partner) => (
                      <li key={partner.ministry} className="flex justify-between gap-3">
                        <span>{partner.ministry}</span>
                        <span className="font-mono text-cyan-50/90">
                          {formatAmount(partner.amount)} {dossier.unit}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <p className="text-xs tracking-wide text-slate-500">最近の契約</p>
                  <div className="mt-2 overflow-x-auto">
                    <table className="min-w-full text-left text-xs">
                      <thead className="text-slate-500">
                        <tr>
                          <th className="px-2 py-1 font-medium">年度</th>
                          <th className="px-2 py-1 font-medium">府省庁</th>
                          <th className="px-2 py-1 font-medium">事業・概要</th>
                          <th className="px-2 py-1 font-medium text-right">金額</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dossier.recentContracts.map((contract, index) => (
                          <tr
                            key={`${contract.fiscalYear}-${contract.project}-${index}`}
                            className="border-t border-white/5 text-slate-300"
                          >
                            <td className="px-2 py-2 whitespace-nowrap">{contract.fiscalYear}</td>
                            <td className="px-2 py-2 whitespace-nowrap">{contract.ministry}</td>
                            <td className="px-2 py-2">
                              <div>{contract.project}</div>
                              <div className="mt-0.5 text-slate-500">
                                {[contract.contract, contract.work].filter(Boolean).join(" / ")}
                              </div>
                            </td>
                            <td className="px-2 py-2 text-right font-mono whitespace-nowrap">
                              {formatAmount(contract.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
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
          。企業住所はレビュー所在地を優先し、不足分は OpenStreetMap で補完します。
          OSM データ © OpenStreetMap contributors。
        </p>
      )}
    </div>
  );
}

async function fetchFlow(key: string): Promise<MoneyFlowResponse> {
  const [yearText, ministryText, payeeText, sectorText, focusKind, focusValue] =
    key.split("|");
  const params = new URLSearchParams({ year: yearText });
  if (ministryText && ministryText !== ALL_MINISTRIES) {
    params.set("ministry", ministryText);
  }
  if (payeeText) params.set("payee", payeeText);
  if (sectorText) params.set("sector", sectorText);
  if (focusKind) params.set("focusKind", focusKind);
  if (focusValue) params.set("focusValue", focusValue);
  const response = await fetchJsonWithTimeout<MoneyFlowResponse>(
    `/api/works/money-flow?${params}`,
    { timeoutMs: 90_000 },
  );
  return response;
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
