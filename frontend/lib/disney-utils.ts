import type { AttractionCrowdBand, CrowdLevel } from "@/lib/types/disney";

export const crowdLevelLabels: Record<CrowdLevel, string> = {
  low: "空いている",
  moderate: "やや混雑",
  high: "混雑",
  extreme: "大混雑",
};

export const crowdLevelColors: Record<CrowdLevel, string> = {
  low: "text-emerald-300 border-emerald-400/30 bg-emerald-500/15",
  moderate: "text-amber-300 border-amber-400/30 bg-amber-500/15",
  high: "text-orange-300 border-orange-400/30 bg-orange-500/15",
  extreme: "text-rose-300 border-rose-400/30 bg-rose-500/15",
};

export function waitTimeColor(minutes: number | null): string {
  if (minutes === null) return "text-slate-500";
  if (minutes <= 20) return "text-emerald-400";
  if (minutes <= 45) return "text-amber-400";
  if (minutes <= 75) return "text-orange-400";
  return "text-rose-400";
}

export function formatWaitTime(minutes: number | null): string {
  if (minutes === null) return "—";
  if (minutes <= 0) return "待ちなし";
  return `${minutes}分`;
}

export function formatJstTime(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  });
}

export function formatJstDateLabel(dateStr: string): string {
  const date = new Date(`${dateStr}T12:00:00+09:00`);
  return date.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Tokyo",
  });
}

export const crowdLevelCellStyles: Record<CrowdLevel, string> = {
  low: "border-emerald-400/60 bg-emerald-500/30",
  moderate: "border-amber-400/60 bg-amber-500/30",
  high: "border-orange-400/60 bg-orange-500/35",
  extreme: "border-rose-400/70 bg-rose-500/40",
};

export const crowdLevelDotColors: Record<CrowdLevel, string> = {
  low: "bg-emerald-400",
  moderate: "bg-amber-400",
  high: "bg-orange-500",
  extreme: "bg-rose-500",
};

export const crowdLevelShortLabels: Record<CrowdLevel, string> = {
  low: "空",
  moderate: "中",
  high: "混",
  extreme: "大",
};

export const crowdLevelBgColors: Record<CrowdLevel, string> = {
  low: "bg-emerald-500/20 hover:bg-emerald-500/30",
  moderate: "bg-amber-500/20 hover:bg-amber-500/30",
  high: "bg-orange-500/20 hover:bg-orange-500/30",
  extreme: "bg-rose-500/20 hover:bg-rose-500/30",
};

export const disneyPanelClass =
  "rounded-2xl border border-white/10 bg-indigo-950/50 shadow-xl shadow-black/20 backdrop-blur-xl";

export const crowdBandCellStyles: Record<AttractionCrowdBand, string> = {
  empty: "bg-emerald-500/35 text-emerald-50",
  moderate: "bg-amber-500/40 text-amber-50",
  busy: "bg-orange-500/45 text-orange-50",
  extreme: "bg-rose-500/50 text-rose-50",
};

export const crowdBandLabels: Record<AttractionCrowdBand, string> = {
  empty: "空",
  moderate: "中",
  busy: "混",
  extreme: "大",
};
