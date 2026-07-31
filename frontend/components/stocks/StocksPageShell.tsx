"use client";

import AppPageShell from "@/components/layout/AppPageShell";

type StocksPageShellProps = {
  children: React.ReactNode;
};

export default function StocksPageShell({ children }: StocksPageShellProps) {
  return <AppPageShell theme="global">{children}</AppPageShell>;
}

const marketBadgeStyles = {
  us: "border-sky-400/30 bg-sky-500/10 text-sky-300",
  jp: "border-rose-400/30 bg-rose-500/10 text-rose-300",
};

export function MarketBadge({ market }: { market: "us" | "jp" }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${marketBadgeStyles[market]}`}
    >
      {market === "jp" ? "JP" : "US"}
    </span>
  );
}
