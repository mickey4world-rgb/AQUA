"use client";

import Link from "next/link";
import AnimatedBackground from "@/components/layout/AnimatedBackground";

type ShowcaseShellProps = {
  children: React.ReactNode;
};

export default function ShowcaseShell({ children }: ShowcaseShellProps) {
  return (
    <div className="relative min-h-screen overflow-x-hidden text-slate-100 app-shell-portal">
      <AnimatedBackground theme="portal" />
      <div className="relative z-10 flex min-h-screen flex-col">
        <header
          className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/70 backdrop-blur-xl"
          style={{ paddingTop: "env(safe-area-inset-top)" }}
        >
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
            <Link href="/" className="group flex items-baseline gap-2">
              <span className="font-display bg-gradient-to-r from-cyan-300 via-teal-200 to-sky-300 bg-clip-text text-lg font-bold tracking-[-0.02em] text-transparent sm:text-xl">
                AQUA
              </span>
              <span className="hidden text-[10px] font-semibold uppercase tracking-[0.32em] text-slate-500 sm:inline">
                Studio
              </span>
            </Link>
            <div className="flex items-center gap-2 sm:gap-3">
              <Link
                href="/"
                className="rounded-full border border-white/12 px-3 py-1.5 text-xs text-slate-300 transition hover:border-white/25 hover:bg-white/5 sm:px-4 sm:py-2 sm:text-sm"
              >
                ホーム
              </Link>
              <Link
                href="/login"
                className="rounded-full bg-gradient-to-r from-cyan-300/90 to-teal-200/90 px-3 py-1.5 text-xs font-medium text-slate-950 transition hover:from-cyan-200 hover:to-teal-100 sm:px-4 sm:py-2 sm:text-sm"
              >
                ログイン
              </Link>
            </div>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
