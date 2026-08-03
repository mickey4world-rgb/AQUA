"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const navItems = [
  { href: "/", label: "ダッシュボード" },
  { href: "/stocks", label: "保有株" },
  { href: "/disney", label: "ディズニー" },
  { href: "/council", label: "AI合議" },
  { href: "/docs", label: "資料生成" },
  { href: "/costs", label: "コスト" },
  { href: "/settings", label: "設定" },
];

type HeaderProps = {
  variant?: "default" | "global" | "disney" | "portal" | "costs" | "council" | "docs";
};

export default function Header({ variant = "default" }: HeaderProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isGlobal = variant === "global";
  const isDisney = variant === "disney";
  const isPortal = variant === "portal";
  const isCosts = variant === "costs";
  const isCouncil = variant === "council";
  const isDocs = variant === "docs";
  const isThemed = isGlobal || isDisney || isPortal || isCosts || isCouncil || isDocs;

  const activeHref = isDisney
    ? "/disney"
    : isCouncil
      ? "/council"
      : isDocs
        ? "/docs"
        : isPortal
        ? "/"
        : isCosts
          ? "/costs"
          : isGlobal
            ? "/stocks"
            : pathname;

  const activeClass = isDisney
    ? "font-medium text-fuchsia-300"
    : isCouncil
      ? "font-medium text-violet-300"
      : isDocs
        ? "font-medium text-blue-300"
        : isPortal
        ? "font-medium text-cyan-300"
        : isCosts
          ? "font-medium text-amber-300"
          : "font-medium text-cyan-300";

  const logoClass = isGlobal
    ? "bg-gradient-to-r from-cyan-300 to-violet-300 bg-clip-text text-transparent"
    : isDisney
      ? "bg-gradient-to-r from-fuchsia-300 to-sky-300 bg-clip-text text-transparent"
      : isCouncil
        ? "bg-gradient-to-r from-violet-300 to-emerald-300 bg-clip-text text-transparent"
        : isDocs
          ? "bg-gradient-to-r from-blue-300 to-sky-300 bg-clip-text text-transparent"
          : isCosts
          ? "bg-gradient-to-r from-amber-300 to-orange-300 bg-clip-text text-transparent"
          : "";

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <header
      className={
        isThemed
          ? "sticky top-0 z-40 border-b border-white/10 bg-slate-950/80 backdrop-blur-xl"
          : "sticky top-0 z-40 border-b border-zinc-200 bg-white/95 backdrop-blur-xl"
      }
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div
        className={`mx-auto flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4 ${
          isThemed ? "max-w-6xl" : "max-w-5xl"
        }`}
      >
        <Link href="/" className="text-base font-semibold sm:text-lg">
          <span
            className={
              logoClass ||
              "bg-gradient-to-r from-cyan-300 via-teal-200 to-sky-300 bg-clip-text text-transparent"
            }
          >
            AQUA
          </span>
          <span className={isThemed ? "text-slate-300" : "text-zinc-600"}> Personal Apps</span>
        </Link>

        <nav className="hidden gap-4 text-sm md:flex">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={
                isThemed
                  ? isActive(item.href)
                    ? activeClass
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
            isThemed
              ? "border-white/10 text-slate-200"
              : "border-zinc-200 text-zinc-700"
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
                  className={`block rounded-lg px-3 py-2.5 text-sm ${
                    isThemed
                      ? isActive(item.href)
                        ? "bg-white/10 font-medium text-white"
                        : "text-slate-300"
                      : isActive(item.href)
                        ? "bg-zinc-100 font-medium text-zinc-900"
                        : "text-zinc-600"
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  );
}
