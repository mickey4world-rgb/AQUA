"use client";

import { useEffect, useMemo, useState } from "react";
import AppSummaryGrid from "@/components/costs/AppSummaryGrid";
import AzureInfraCostPanel from "@/components/costs/AzureInfraCostPanel";
import CostsPageShell from "@/components/costs/CostsPageShell";
import DailyUsageChart from "@/components/costs/DailyUsageChart";
import FeatureBreakdownTable from "@/components/costs/FeatureBreakdownTable";
import QuotaCard from "@/components/costs/QuotaCard";
import SolunaOpsAnalyticsPanels from "@/components/costs/SolunaOpsAnalyticsPanels";
import UsageHistory from "@/components/costs/UsageHistory";
import type {
  AzureInfraCostSummary,
  CostDashboard,
  SolunaOpsAnalyticsReport,
} from "@/lib/types/analytics";
import { PAGE_MAIN_CLASS } from "@/lib/mobile-utils";

type CostsTab = "ai" | "soluna";

function currentMonthParam(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function shiftMonth(month: string, delta: number): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return currentMonthParam();
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1 + delta, 1),
  );
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export default function CostsPage() {
  const [tab, setTab] = useState<CostsTab>("ai");
  const [month, setMonth] = useState(currentMonthParam());
  const [dashboard, setDashboard] = useState<CostDashboard | null>(null);
  const [azureInfra, setAzureInfra] = useState<AzureInfraCostSummary | null>(null);
  const [solunaOps, setSolunaOps] = useState<SolunaOpsAnalyticsReport | null>(null);
  const [loadedMonth, setLoadedMonth] = useState<string | null>(null);
  const [azureLoadedMonth, setAzureLoadedMonth] = useState<string | null>(null);
  const [solunaLoadedMonth, setSolunaLoadedMonth] = useState<string | null>(null);
  const [solunaError, setSolunaError] = useState<string | null>(null);

  const loadingAi = loadedMonth !== month;
  const azureLoading = azureLoadedMonth !== month;
  const loadingSoluna = solunaLoadedMonth !== month;
  const isCurrentMonth = useMemo(() => month === currentMonthParam(), [month]);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/costs/dashboard?month=${month}`)
      .then(async (res) =>
        res.ok ? ((await res.json()) as CostDashboard) : null,
      )
      .catch(() => null)
      .then((data) => {
        if (cancelled) return;
        if (data) setDashboard(data);
        setLoadedMonth(month);
      });

    return () => {
      cancelled = true;
    };
  }, [month]);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/costs/azure-infra?month=${month}`)
      .then(async (res) =>
        res.ok ? ((await res.json()) as AzureInfraCostSummary | null) : null,
      )
      .catch(() => null)
      .then((data) => {
        if (cancelled) return;
        setAzureInfra(data);
        setAzureLoadedMonth(month);
      });

    return () => {
      cancelled = true;
    };
  }, [month]);

  useEffect(() => {
    let cancelled = false;
    setSolunaError(null);

    fetch(`/api/costs/soluna-ops?month=${month}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `HTTP ${res.status}`);
        }
        return (await res.json()) as SolunaOpsAnalyticsReport;
      })
      .then((data) => {
        if (cancelled) return;
        setSolunaOps(data);
        setSolunaLoadedMonth(month);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setSolunaError(err instanceof Error ? err.message : "読み込みに失敗しました");
        setSolunaLoadedMonth(month);
      });

    return () => {
      cancelled = true;
    };
  }, [month]);

  const monthLabel =
    tab === "soluna"
      ? solunaOps?.monthLabel ?? month
      : dashboard?.monthLabel ?? month;

  return (
    <CostsPageShell>
      <main className={PAGE_MAIN_CLASS}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-300/80">
              Usage Analytics
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              コスト・利用分析ダッシュボード
            </h1>
            <p className="mt-2 max-w-2xl text-slate-400">
              AI トークン・Azure 実績に加え、Soluna の bitFlyer 資産運用と BOINC
              社会貢献の詳細も確認できます。
            </p>
            <a
              href="/costs/access"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-2 rounded-full border border-amber-400/25 bg-amber-500/10 px-4 py-2 text-sm text-amber-100 transition hover:border-amber-400/40 hover:bg-amber-500/15"
            >
              アクセス分析 — 公開 / 内部（別タブ）
              <span aria-hidden>↗</span>
            </a>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMonth((m) => shiftMonth(m, -1))}
              className="rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-300 hover:bg-white/5"
            >
              ←
            </button>
            <span className="min-w-[8rem] text-center text-sm font-medium text-white">
              {monthLabel}
            </span>
            <button
              type="button"
              onClick={() => setMonth((m) => shiftMonth(m, 1))}
              disabled={isCurrentMonth}
              className="rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-300 hover:bg-white/5 disabled:opacity-30"
            >
              →
            </button>
            {!isCurrentMonth && (
              <button
                type="button"
                onClick={() => setMonth(currentMonthParam())}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300 hover:bg-white/10"
              >
                今月
              </button>
            )}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTab("ai")}
            className={`rounded-full px-4 py-2 text-sm transition ${
              tab === "ai"
                ? "bg-gradient-to-r from-amber-600 to-orange-600 text-white"
                : "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
            }`}
          >
            AI・Azure コスト
          </button>
          <button
            type="button"
            onClick={() => setTab("soluna")}
            className={`rounded-full px-4 py-2 text-sm transition ${
              tab === "soluna"
                ? "bg-gradient-to-r from-cyan-600 to-teal-600 text-white"
                : "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
            }`}
          >
            Soluna 資産運用・BOINC
          </button>
        </div>

        {tab === "ai" ? (
          loadingAi || !dashboard ? (
            <div className="mt-10 flex items-center gap-3 text-sm text-slate-400">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-300" />
              分析データを読み込み中...
            </div>
          ) : (
            <div className="mt-8 space-y-6">
              <QuotaCard quota={dashboard.quota} monthLabel={dashboard.monthLabel} />
              <AzureInfraCostPanel
                azure={azureInfra}
                quota={dashboard.quota}
                monthLabel={dashboard.monthLabel}
                loading={azureLoading}
              />
              <AppSummaryGrid apps={dashboard.byApp} />
              <DailyUsageChart points={dashboard.dailyUsage} />
              <FeatureBreakdownTable features={dashboard.byFeature} />
              <UsageHistory
                tokens={dashboard.recentTokens}
                access={dashboard.recentAccess}
              />
            </div>
          )
        ) : loadingSoluna ? (
          <div className="mt-10 flex items-center gap-3 text-sm text-slate-400">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-400/30 border-t-cyan-300" />
            Soluna 運用データを読み込み中...
          </div>
        ) : solunaError ? (
          <div className="mt-10 rounded-2xl border border-rose-400/25 bg-rose-500/10 px-5 py-4 text-sm text-rose-100">
            {solunaError}
          </div>
        ) : solunaOps ? (
          <div className="mt-8">
            <SolunaOpsAnalyticsPanels report={solunaOps} />
          </div>
        ) : null}
      </main>
    </CostsPageShell>
  );
}
