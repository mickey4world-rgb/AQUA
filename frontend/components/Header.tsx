"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const navItems = [
  { href: "/", label: "ホーム", en: "Index" },
  { href: "/works", label: "WORKS", en: "Works" },
  { href: "/stocks", label: "保有株", en: "Stocks" },
  { href: "/disney", label: "ディズニー", en: "Disney" },
  { href: "/council", label: "AI合議", en: "Council" },
  { href: "/soluna", label: "Soluna", en: "Soluna" },
  { href: "/space", label: "宇宙", en: "Space" },
  { href: "/costs", label: "コスト", en: "Costs" },
  { href: "/settings", label: "設定", en: "Settings" },
];

export type HeaderVariant =
  | "default"
  | "global"
  | "disney"
  | "portal"
  | "costs"
  | "council"
  | "soluna"
  | "docs"
  | "space"
  | "works";

type ThemeStyle = {
  /** Route highlighted even when the pathname is deeper (e.g. /works/docs). */
  anchor?: string;
  active: string;
  logo: string;
};

const THEMES: Record<Exclude<HeaderVariant, "default">, ThemeStyle> = {
  portal: {
    anchor: "/",
    active: "text-cyan-300",
    logo: "from-cyan-300 via-teal-200 to-sky-300",
  },
  global: {
    anchor: "/stocks",
    active: "text-cyan-300",
    logo: "from-cyan-300 to-violet-300",
  },
  disney: {
    anchor: "/disney",
    active: "text-fuchsia-300",
    logo: "from-fuchsia-300 to-sky-300",
  },
  costs: {
    anchor: "/costs",
    active: "text-amber-300",
    logo: "from-amber-300 to-orange-300",
  },
  council: {
    anchor: "/council",
    active: "text-violet-300",
    logo: "from-violet-300 to-emerald-300",
  },
  soluna: {
    anchor: "/soluna",
    active: "text-amber-200",
    logo: "from-amber-300 via-orange-200 to-indigo-300",
  },
  docs: {
    anchor: "/works",
    active: "text-blue-300",
    logo: "from-blue-300 to-sky-300",
  },
  space: {
    anchor: "/space",
    active: "text-indigo-300",
    logo: "from-indigo-300 to-violet-300",
  },
  works: {
    anchor: "/works",
    active: "text-emerald-300",
    logo: "from-emerald-300 via-teal-200 to-amber-200",
  },
};

type HeaderProps = {
  variant?: HeaderVariant;
};

export default function Header({ variant = "default" }: HeaderProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const theme = variant === "default" ? null : THEMES[variant];
  const isThemed = theme !== null;

  function isActive(href: string) {
    if (theme?.anchor) return theme.anchor === href;
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <header
      className={
        isThemed
          ? "sticky top-0 z-40 border-b border-white/10 bg-slate-950/70 backdrop-blur-xl"
          : "sticky top-0 z-40 border-b border-zinc-200 bg-white/95 backdrop-blur-xl"
      }
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
        <Link href="/" className="group flex items-baseline gap-2">
          <span
            className={`font-display text-lg font-bold tracking-[-0.02em] sm:text-xl ${
              isThemed
                ? `bg-gradient-to-r bg-clip-text text-transparent ${theme.logo}`
                : "text-zinc-900"
            }`}
          >
            AQUA
          </span>
          <span
            className={`hidden text-[10px] font-semibold uppercase tracking-[0.32em] sm:inline ${
              isThemed ? "text-slate-500" : "text-zinc-500"
            }`}
          >
            Studio
          </span>
        </Link>

        <nav className="hidden items-center gap-5 text-sm md:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={
                isThemed
                  ? isActive(item.href)
                    ? `font-medium ${theme.active}`
                    : "text-slate-400 transition hover:text-slate-100"
                  : isActive(item.href)
                    ? "font-medium text-zinc-900"
                    : "text-zinc-600 hover:text-zinc-900"
              }
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <button
          type="button"
          className={`rounded-lg border px-3 py-2 text-sm md:hidden ${
            isThemed ? "border-white/10 text-slate-200" : "border-zinc-200 text-zinc-700"
          }`}
          aria-expanded={open}
          aria-label="メニューを開く"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "✕" : "☰"}
        </button>
      </div>

      {open && (
        <nav
          className={`border-t px-4 py-3 md:hidden ${
            isThemed ? "border-white/10 bg-slate-950/95" : "border-zinc-200 bg-white"
          }`}
        >
          <ul className="space-y-1">
            {navItems.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`flex items-baseline justify-between rounded-lg px-3 py-2.5 text-sm ${
                    isThemed
                      ? isActive(item.href)
                        ? "bg-white/10 font-medium text-white"
                        : "text-slate-300"
                      : isActive(item.href)
                        ? "bg-zinc-100 font-medium text-zinc-900"
                        : "text-zinc-600"
                  }`}
                >
                  <span>{item.label}</span>
                  <span className="font-display text-[10px] uppercase tracking-[0.3em] text-slate-500">
                    {item.en}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}
