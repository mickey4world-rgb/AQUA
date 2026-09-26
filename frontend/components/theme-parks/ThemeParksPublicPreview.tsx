"use client";

import DisneyPublicPreview from "@/components/disney/DisneyPublicPreview";
import PublicPreviewNav from "@/components/public/PublicPreviewNav";
import UsjPublicPreview from "@/components/usj/UsjPublicPreview";
import { PAGE_MAIN_CLASS } from "@/lib/mobile-utils";
import type { ThemeResortTab } from "@/lib/types/theme-park";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback } from "react";

function parseTab(raw: string | null): ThemeResortTab {
  return raw === "usj" ? "usj" : "disney";
}

function ThemeParksPreviewTabs() {
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
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-fuchsia-300/80">
          Theme Parks Public Preview
        </p>
        <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
          テーマパーク混雑予測プレビュー
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          ディズニーとUSJの混雑予測を無料公開しています。タブで切り替えてご覧ください。
        </p>
        <div
          role="tablist"
          aria-label="テーマパーク"
          className="mt-5 inline-flex rounded-2xl border border-white/10 bg-white/[0.04] p-1"
        >
          {(
            [
              { id: "disney" as const, label: "ディズニー", en: "TDR" },
              { id: "usj" as const, label: "USJ", en: "Universal" },
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
                  <span className="ml-1.5 text-[11px] opacity-70">{item.en}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {tab === "disney" ? (
        <DisneyPublicPreview embedded />
      ) : (
        <UsjPublicPreview showNav={false} />
      )}
    </>
  );
}

export default function ThemeParksPublicPreview() {
  return (
    <main
      className={`${PAGE_MAIN_CLASS} mx-auto min-h-screen max-w-6xl bg-gradient-to-b from-indigo-950 via-slate-950 to-black px-4 py-8 sm:px-6`}
    >
      <PublicPreviewNav showcaseAnchor="theme-parks" />
      <Suspense
        fallback={
          <p className="mt-8 text-center text-sm text-slate-400">読み込み中…</p>
        }
      >
        <ThemeParksPreviewTabs />
      </Suspense>
    </main>
  );
}
