"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AccessAnalyticsPanels from "@/components/costs/AccessAnalyticsPanels";
import PublicAccessAnalyticsPanels from "@/components/costs/PublicAccessAnalyticsPanels";
import CostsPageShell from "@/components/costs/CostsPageShell";
import type {
  AccessAnalyticsReport,
  PublicAccessAnalyticsReport,
} from "@/lib/types/analytics";
import { PAGE_MAIN_CLASS } from "@/lib/mobile-utils";

type AnalyticsTab = "public" | "internal";

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
  const [tab, setTab] = useState<AnalyticsTab>("public");
  const [month, setMonth] = useState(currentMonthParam());
  const [publicReport, setPublicReport] = useState<PublicAccessAnalyticsReport | null>(null);
  const [internalReport, setInternalReport] = useState<AccessAnalyticsReport | null>(null);
  const [publicLoadedMonth, setPublicLoadedMonth] = useState<string | null>(null);
  const [internalLoadedMonth, setInternalLoadedMonth] = useState<string | null>(null);
  const [publicError, setPublicError] = useState<string | null>(null);
  const [internalError, setInternalError] = useState<string | null>(null);

  const isCurrentMonth = useMemo(() => month === currentMonthParam(), [month]);
  const loading =
    tab === "public" ? publicLoadedMonth !== month : internalLoadedMonth !== month;
  const activeError = tab === "public" ? publicError : internalError;
  const monthLabel =
    tab === "public" ? publicReport?.monthLabel : internalReport?.monthLabel;

  useEffect(() => {
    let cancelled = false;
    setPublicError(null);

    fetch(`/api/costs/public-access-analytics?month=${month}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `HTTP ${res.status}`);
        }
        return (await res.json()) as PublicAccessAnalyticsReport;
      })
      .then((data) => {
        if (cancelled) return;
        setPublicReport(data);
        setPublicLoadedMonth(month);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setPublicError(err instanceof Error ? err.message : "読み込みに失敗しました");
        setPublicLoadedMonth(month);
      });

    return () => {
      cancelled = true;
    };
  }, [month]);

  useEffect(() => {
    let cancelled = false;
    setInternalError(null);

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
        setInternalReport(data);
        setInternalLoadedMonth(month);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setInternalError(err instanceof Error ? err.message : "読み込みに失敗しました");
        setInternalLoadedMonth(month);
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
              公開フロント（認証不要ページ）の訪問者分析と、ログイン後の内部 API
              利用分析を分けて表示します。
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
              {monthLabel ?? month}
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
            onClick={() => setTab("public")}
            className={`rounded-full px-4 py-2 text-sm transition ${
              tab === "public"
                ? "bg-gradient-to-r from-cyan-600 to-teal-600 text-white"
                : "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
            }`}
          >
            公開フロント（一般訪問者）
          </button>
          <button
            type="button"
            onClick={() => setTab("internal")}
            className={`rounded-full px-4 py-2 text-sm transition ${
              tab === "internal"
                ? "bg-gradient-to-r from-amber-600 to-orange-600 text-white"
                : "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
            }`}
          >
            内部ユーザー（API 利用）
          </button>
        </div>

        {loading ? (
          <div className="mt-10 flex items-center gap-3 text-sm text-slate-400">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-300" />
            アクセス分析を読み込み中...
          </div>
        ) : activeError ? (
          <div className="mt-10 rounded-2xl border border-rose-400/25 bg-rose-500/10 px-5 py-4 text-sm text-rose-100">
            {activeError}
          </div>
        ) : (
          <div className="mt-8">
            {tab === "public" && publicReport && (
              <PublicAccessAnalyticsPanels report={publicReport} />
            )}
            {tab === "internal" && internalReport && (
              <AccessAnalyticsPanels report={internalReport} />
            )}
          </div>
        )}
      </main>
    </CostsPageShell>
  );
}
