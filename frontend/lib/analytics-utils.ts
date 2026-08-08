export function formatUsd(amount: number): string {
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}

export function formatCurrency(amount: number, currency = "JPY"): string {
  if (currency === "JPY") {
    return `¥${Math.round(amount).toLocaleString("ja-JP")}`;
  }
  if (amount < 0.01) return `${currency} ${amount.toFixed(4)}`;
  return `${currency} ${amount.toFixed(2)}`;
}

export function formatTokens(count: number): string {
  return count.toLocaleString("ja-JP");
}

export function formatPercent(value: number): string {
  return `${Math.min(100, Math.max(0, value)).toFixed(1)}%`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export const costsPanelClass =
  "rounded-2xl border border-white/10 bg-slate-950/60 shadow-xl shadow-black/20 backdrop-blur-xl";

export const appAccentStyles = {
  stocks: {
    border: "border-cyan-400/20",
    bg: "bg-cyan-500/10",
    text: "text-cyan-300",
  },
  disney: {
    border: "border-fuchsia-400/20",
    bg: "bg-fuchsia-500/10",
    text: "text-fuchsia-300",
  },
  costs: {
    border: "border-amber-400/20",
    bg: "bg-amber-500/10",
    text: "text-amber-300",
  },
  council: {
    border: "border-violet-400/20",
    bg: "bg-violet-500/10",
    text: "text-violet-300",
  },
  docs: {
    border: "border-blue-400/20",
    bg: "bg-blue-500/10",
    text: "text-blue-300",
  },
  works: {
    border: "border-teal-400/20",
    bg: "bg-teal-500/10",
    text: "text-teal-300",
  },
  space: {
    border: "border-indigo-400/20",
    bg: "bg-indigo-500/10",
    text: "text-indigo-300",
  },
  users: {
    border: "border-emerald-400/20",
    bg: "bg-emerald-500/10",
    text: "text-emerald-300",
  },
  system: {
    border: "border-slate-400/20",
    bg: "bg-slate-500/10",
    text: "text-slate-300",
  },
} as const;
