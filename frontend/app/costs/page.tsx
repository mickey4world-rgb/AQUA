"use client";

import { useEffect, useMemo, useState } from "react";
import AppSummaryGrid from "@/components/costs/AppSummaryGrid";
import AzureInfraCostPanel from "@/components/costs/AzureInfraCostPanel";
import CostsPageShell from "@/components/costs/CostsPageShell";
import DailyUsageChart from "@/components/costs/DailyUsageChart";
import FeatureBreakdownTable from "@/components/costs/FeatureBreakdownTable";
import QuotaCard from "@/components/costs/QuotaCard";
import UsageHistory from "@/components/costs/UsageHistory";
import type { AzureInfraCostSummary, CostDashboard } from "@/lib/types/analytics";
import { PAGE_MAIN_CLASS } from "@/lib/mobile-utils";

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
  const [month, setMonth] = useState(currentMonthParam());
  const [dashboard, setDashboard] = useState<CostDashboard | null>(null);
  const [azureInfra, setAzureInfra] = useState<AzureInfraCostSummary | null>(null);
  // 表示中の月と読み込み済みの月がずれている間がローディング。
  const [loadedMonth, setLoadedMonth] = useState<string | null>(null);
  const [azureLoadedMonth, setAzureLoadedMonth] = useState<string | null>(null);
  const loading = loadedMonth !== month;
  const azureLoading = azureLoadedMonth !== month;

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
        // 取得に失敗したときは前月分の表示を残したままローディングだけ解除する。
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
              各アプリの AI トークン使用量・推定コストに加え、Azure
              サブスクリプションの実績請求額も確認できます。
            </p>
            <a
              href="/costs/access"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-2 rounded-full border border-amber-400/25 bg-amber-500/10 px-4 py-2 text-sm text-amber-100 transition hover:border-amber-400/40 hover:bg-amber-500/15"
            >
              アクセス情報分析（別タブ）
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
              {dashboard?.monthLabel ?? month}
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

        {loading || !dashboard ? (
          <div className="mt-10 flex items-center gap-3 text-sm text-slate-400">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-300" />
            分析データを読み込み中...
          </div>
        ) : (
          <div className="mt-8 space-y-6">
            <QuotaCard
              quota={dashboard.quota}
              monthLabel={dashboard.monthLabel}
            />
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
        )}
      </main>
    </CostsPageShell>
  );
}
