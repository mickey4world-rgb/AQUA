"use client";

import Header from "@/components/Header";

const marketBadgeStyles = {
  us: "border-sky-400/30 bg-sky-500/10 text-sky-300",
  jp: "border-rose-400/30 bg-rose-500/10 text-rose-300",
};

type StocksPageShellProps = {
  children: React.ReactNode;
};

export default function StocksPageShell({ children }: StocksPageShellProps) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-0 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute right-0 top-20 h-[28rem] w-[28rem] rounded-full bg-violet-600/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-emerald-500/10 blur-3xl" />
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(148,163,184,0.18) 1px, transparent 0)",
            backgroundSize: "28px 28px",
          }}
        />
      </div>

      <div className="relative z-10">
        <Header variant="global" />
        {children}
      </div>
    </div>
  );
}

export function MarketBadge({ market }: { market: "us" | "jp" }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${marketBadgeStyles[market]}`}
    >
      {market === "jp" ? "JP" : "US"}
    </span>
  );
}
