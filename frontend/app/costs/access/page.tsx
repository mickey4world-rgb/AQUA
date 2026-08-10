"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AccessAnalyticsPanels from "@/components/costs/AccessAnalyticsPanels";
import CostsPageShell from "@/components/costs/CostsPageShell";
import type { AccessAnalyticsReport } from "@/lib/types/analytics";
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

export default function AccessAnalyticsPage() {
  const [month, setMonth] = useState(currentMonthParam());
  const [report, setReport] = useState<AccessAnalyticsReport | null>(null);
  const [loadedMonth, setLoadedMonth] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loading = loadedMonth !== month;
  const isCurrentMonth = useMemo(() => month === currentMonthParam(), [month]);

  useEffect(() => {
    let cancelled = false;
    setError(null);

    fetch(`/api/costs/access-analytics?month=${month}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `HTTP ${res.status}`);
        }
        return (await res.json()) as AccessAnalyticsReport;
      })
      .then((data) => {
        if (cancelled) return;
        setReport(data);
        setLoadedMonth(month);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "読み込みに失敗しました");
        setLoadedMonth(month);
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
            <Link
              href="/costs"
              className="text-xs uppercase tracking-[0.28em] text-slate-500 transition hover:text-slate-300"
            >
              ← コスト分析
            </Link>
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.3em] text-amber-300/80">
              Access Analytics
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
              アクセス情報分析
            </h1>
            <p className="mt-2 max-w-2xl text-slate-400">
              だれが・どのモジュールの・どの API を・何回使ったかを集計表示します。
              API 呼び出しログ（Cosmos DB AccessLogs）をもとにしています。
            </p>
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
              {report?.monthLabel ?? month}
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

        {loading || !report ? (
          <div className="mt-10 flex items-center gap-3 text-sm text-slate-400">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-300" />
            アクセス分析を読み込み中...
          </div>
        ) : error ? (
          <div className="mt-10 rounded-2xl border border-rose-400/25 bg-rose-500/10 px-5 py-4 text-sm text-rose-100">
            {error}
          </div>
        ) : (
          <div className="mt-8">
            <AccessAnalyticsPanels report={report} />
          </div>
        )}
      </main>
    </CostsPageShell>
  );
}
