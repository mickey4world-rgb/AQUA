"use client";

import AppPageShell from "@/components/layout/AppPageShell";
import DisneyParkDashboard from "@/components/disney/DisneyParkDashboard";
import UsjParkDashboard from "@/components/usj/UsjParkDashboard";
import type { ThemeResortTab } from "@/lib/types/theme-park";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback } from "react";

function parseTab(raw: string | null): ThemeResortTab {
  return raw === "usj" ? "usj" : "disney";
}

function ThemeParksTabs() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab = parseTab(searchParams.get("tab"));

  const setTab = useCallback(
    (next: ThemeResortTab) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", next);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return (
    <>
      <div className="mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6">
        <div
          role="tablist"
          aria-label="テーマパーク"
          className="inline-flex rounded-2xl border border-white/10 bg-white/[0.04] p-1"
        >
          {(
            [
              { id: "disney", label: "ディズニー", en: "TDR" },
              { id: "usj", label: "USJ", en: "Universal" },
            ] as const
          ).map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(item.id)}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition sm:px-5 ${
                  active
                    ? item.id === "disney"
                      ? "bg-gradient-to-r from-fuchsia-500 to-sky-500 text-white shadow"
                      : "bg-gradient-to-r from-red-500 to-amber-400 text-white shadow"
                    : "text-slate-300 hover:bg-white/5"
                }`}
              >
                <span className="sm:hidden">{item.label}</span>
                <span className="hidden sm:inline">
                  {item.label}
                  <span className="ml-1.5 text-[11px] opacity-70">
                    {item.en}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {tab === "disney" ? <DisneyParkDashboard /> : <UsjParkDashboard />}
    </>
  );
}

export default function ThemeParksPage() {
  return (
    <AppPageShell theme="disney">
      <Suspense
        fallback={
          <main className="mx-auto max-w-6xl px-4 py-10 text-sm text-slate-400">
            読み込み中…
          </main>
        }
      >
        <ThemeParksTabs />
      </Suspense>
    </AppPageShell>
  );
}
