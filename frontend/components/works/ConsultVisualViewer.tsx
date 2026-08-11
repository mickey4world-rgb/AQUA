"use client";

import { useMemo, useRef, useState } from "react";
import {
  consultExportFileName,
  consultVisualToMarkdown,
  downloadBase64File,
  downloadTextFile,
} from "@/lib/consult-visual-utils";
import {
  CONSULT_VISUAL_LAYOUT_LABELS,
  type ConsultVisualDocument,
  type ConsultVisualLayout,
} from "@/lib/types/consult-visual";

const TONE_CLASS = {
  cyan: "from-cyan-400/90 to-sky-500/90 shadow-cyan-500/20",
  teal: "from-teal-400/90 to-emerald-500/90 shadow-teal-500/20",
  violet: "from-violet-400/90 to-purple-500/90 shadow-violet-500/20",
  amber: "from-amber-300/90 to-orange-400/90 shadow-amber-400/20",
} as const;

const DIAGRAM_HEADERS = [
  "from-[#0E2841] to-[#156082]",
  "from-[#156082] to-[#0F9ED5]",
  "from-[#0F9ED5] to-[#0BD0D9]",
  "from-[#0BD0D9] to-[#467886]",
  "from-[#467886] to-[#9DD4CF]",
];

function ArchNode({
  label,
  index,
  className = "",
}: {
  label: string;
  index: number;
  className?: string;
}) {
  return (
    <div
      className={`consult-visual-node overflow-hidden rounded-xl border border-white/15 bg-white/[0.04] shadow-lg ${className}`}
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <div
        className={`bg-gradient-to-r px-3 py-2 text-center text-[11px] font-semibold tracking-wide text-white ${DIAGRAM_HEADERS[index % DIAGRAM_HEADERS.length]}`}
      >
        {label}
      </div>
      <div className="h-2 bg-gradient-to-r from-cyan-400/20 via-sky-400/10 to-transparent" />
    </div>
  );
}

function FlowDiagram({ labels }: { labels: string[] }) {
  return (
    <div className="consult-visual-diagram flex flex-wrap items-center justify-center gap-2 p-4">
      {labels.map((label, i) => (
        <div key={`${label}-${i}`} className="flex items-center gap-2">
          <ArchNode label={label} index={i} className="min-w-[5.5rem]" />
          {i < labels.length - 1 && (
            <svg width="28" height="16" viewBox="0 0 28 16" aria-hidden className="shrink-0 text-cyan-300/80">
              <path d="M0 8 H18 M18 8 L12 3 M18 8 L12 13" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          )}
        </div>
      ))}
    </div>
  );
}

function ComparisonDiagram({ labels }: { labels: string[] }) {
  return (
    <div className="consult-visual-diagram grid grid-cols-[1fr_auto_1fr] items-center gap-3 p-4">
      <ArchNode label={labels[0] ?? ""} index={0} />
      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-cyan-300/30 bg-cyan-400/10 text-lg text-cyan-200">
        ⇄
      </div>
      <ArchNode label={labels[1] ?? ""} index={1} />
    </div>
  );
}

function TimelineDiagram({ labels }: { labels: string[] }) {
  return (
    <div className="consult-visual-diagram px-4 py-5">
      <div className="relative flex justify-between">
        <div className="absolute left-4 right-4 top-3 h-0.5 bg-gradient-to-r from-cyan-400/20 via-cyan-300 to-violet-400/30" />
        {labels.map((label, i) => (
          <div key={`${label}-${i}`} className="relative z-10 flex flex-1 flex-col items-center gap-2">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br text-xs font-bold text-white shadow-lg ${DIAGRAM_HEADERS[i % DIAGRAM_HEADERS.length]}`}
            >
              {i + 1}
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.05] px-2 py-1.5 text-center text-[10px] leading-snug text-slate-200">
              {label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PyramidDiagram({ labels }: { labels: string[] }) {
  return (
    <div className="consult-visual-diagram flex flex-col items-center gap-2 p-4">
      {labels.map((label, i) => (
        <div
          key={`${label}-${i}`}
          className={`consult-visual-node rounded-xl bg-gradient-to-r px-4 py-2.5 text-center text-[11px] font-semibold text-white shadow-lg ${DIAGRAM_HEADERS[Math.min(i, DIAGRAM_HEADERS.length - 1)]}`}
          style={{ width: `${100 - i * 12}%`, animationDelay: `${i * 90}ms` }}
        >
          {label}
        </div>
      ))}
    </div>
  );
}

function IconsDiagram({ labels }: { labels: string[] }) {
  return (
    <div className="consult-visual-diagram grid grid-cols-2 gap-3 p-4">
      {labels.map((label, i) => (
        <ArchNode key={`${label}-${i}`} label={label} index={i} />
      ))}
    </div>
  );
}

function DiagramCanvas({
  layout,
  labels,
}: {
  layout: ConsultVisualLayout;
  labels: string[];
}) {
  if (labels.length < 2) return null;

  switch (layout) {
    case "flow":
      return <FlowDiagram labels={labels} />;
    case "comparison":
      return <ComparisonDiagram labels={labels} />;
    case "timeline":
      return <TimelineDiagram labels={labels} />;
    case "pyramid":
      return <PyramidDiagram labels={labels} />;
    case "icons":
    case "cards":
    case "highlights":
      return <IconsDiagram labels={labels} />;
    default:
      return <FlowDiagram labels={labels} />;
  }
}

type ConsultVisualViewerProps = {
  visual: ConsultVisualDocument | null;
  reply?: string | null;
  loading?: boolean;
  layoutHint?: ConsultVisualLayout | null;
};

export default function ConsultVisualViewer({
  visual,
  reply,
  loading = false,
}: ConsultVisualViewerProps) {
  const captureRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const layoutLabel = useMemo(
    () => (visual ? CONSULT_VISUAL_LAYOUT_LABELS[visual.layout] : null),
    [visual],
  );

  async function exportMarkdown() {
    if (!visual) return;
    const md = consultVisualToMarkdown(visual, reply ?? undefined);
    downloadTextFile(
      md,
      consultExportFileName(visual.title, "md"),
      "text/markdown;charset=utf-8",
    );
  }

  async function exportPptx() {
    if (!visual) return;
    setExporting("pptx");
    setExportError(null);
    try {
      const res = await fetch("/api/works/consult/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visual, reply }),
      });
      const data = await res.json();
      if (!res.ok) {
        setExportError(data.error ?? "PPTX の出力に失敗しました");
        return;
      }
      downloadBase64File(
        data.base64 as string,
        data.fileName as string,
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      );
    } catch {
      setExportError("PPTX の出力に失敗しました");
    } finally {
      setExporting(null);
    }
  }

  async function exportPdf() {
    if (!visual || !captureRef.current) return;
    setExporting("pdf");
    setExportError(null);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);
      const canvas = await html2canvas(captureRef.current, {
        backgroundColor: "#071018",
        scale: 2,
        useCORS: true,
      });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({
        orientation: canvas.width > canvas.height ? "landscape" : "portrait",
        unit: "px",
        format: [canvas.width, canvas.height],
      });
      pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
      pdf.save(consultExportFileName(visual.title, "pdf"));
    } catch {
      setExportError("PDF の出力に失敗しました");
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="consult-visual-viewer relative flex min-h-[34rem] flex-col overflow-hidden rounded-2xl border border-cyan-300/15 bg-[#071018]/80 p-5 backdrop-blur-xl">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_15%_0%,rgba(56,189,248,0.16),transparent_50%),radial-gradient(ellipse_at_90%_20%,rgba(139,92,246,0.12),transparent_45%)]" />
      <div className="pointer-events-none absolute -right-16 top-24 h-48 w-48 rounded-full bg-cyan-400/10 blur-3xl" />

      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-medium tracking-[0.28em] text-cyan-200/70 uppercase">
            Visual Brief
          </p>
          <h2 className="mt-1 text-lg font-semibold text-white">AI 図解ビューワー</h2>
          <p className="mt-1 text-xs text-slate-400">
            回答内容を AI が最適な構成図・フローに変換して表示します
          </p>
        </div>

        {visual && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={exportMarkdown}
              className="rounded-full border border-white/12 px-3 py-1.5 text-[11px] text-slate-200 transition hover:bg-white/5"
            >
              MD
            </button>
            <button
              type="button"
              onClick={exportPdf}
              disabled={exporting === "pdf"}
              className="rounded-full border border-white/12 px-3 py-1.5 text-[11px] text-slate-200 transition hover:bg-white/5 disabled:opacity-50"
            >
              {exporting === "pdf" ? "PDF…" : "PDF"}
            </button>
            <button
              type="button"
              onClick={exportPptx}
              disabled={exporting === "pptx"}
              className="rounded-full border border-cyan-300/25 bg-cyan-400/10 px-3 py-1.5 text-[11px] font-medium text-cyan-100 transition hover:bg-cyan-400/15 disabled:opacity-50"
            >
              {exporting === "pptx" ? "PPTX…" : "PPTX"}
            </button>
          </div>
        )}
      </div>

      {exportError && (
        <p className="relative mt-3 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {exportError}
        </p>
      )}

      <div ref={captureRef} className="relative mt-5 flex-1">
        {loading && (
          <div className="consult-visual-loading flex h-full min-h-[24rem] flex-col items-center justify-center rounded-2xl border border-white/8 bg-white/[0.02] p-8">
            <div className="consult-visual-spinner h-12 w-12 rounded-full border-2 border-cyan-300/20 border-t-cyan-300" />
            <p className="mt-4 text-sm text-slate-300">図解を生成しています…</p>
            <p className="mt-1 text-xs text-slate-500">レイアウトを AI が選定中</p>
          </div>
        )}

        {!loading && !visual && (
          <div className="flex h-full min-h-[24rem] flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-8 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10">
              <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden className="text-cyan-200/80">
                <rect x="4" y="8" width="10" height="8" rx="2" fill="currentColor" opacity="0.5" />
                <rect x="18" y="8" width="10" height="8" rx="2" fill="currentColor" opacity="0.35" />
                <rect x="11" y="20" width="10" height="8" rx="2" fill="currentColor" opacity="0.65" />
              </svg>
            </div>
            <p className="text-sm text-slate-300">相談を送ると、ここに図解が表示されます</p>
            <p className="mt-2 max-w-xs text-xs leading-relaxed text-slate-500">
              フロー・比較・タイムライン・構成図など、内容に合わせて自動で選びます
            </p>
          </div>
        )}

        {!loading && visual && (
          <div className="consult-visual-enter space-y-4">
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02]">
              <div className="border-b border-white/8 bg-[#0E2841]/70 px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  {layoutLabel && (
                    <span className="rounded-full border border-cyan-300/25 bg-cyan-400/10 px-2.5 py-0.5 text-[10px] font-medium text-cyan-100">
                      {layoutLabel}
                    </span>
                  )}
                </div>
                <h3 className="mt-2 text-xl font-semibold tracking-tight text-white">{visual.title}</h3>
                {visual.subtitle && (
                  <p className="mt-1 text-sm text-cyan-100/70">{visual.subtitle}</p>
                )}
              </div>

              {visual.highlights.length > 0 && (
                <div className="grid gap-3 border-b border-white/8 p-4 sm:grid-cols-3">
                  {visual.highlights.map((item, i) => (
                    <div
                      key={`${item.label}-${i}`}
                      className="consult-visual-node rounded-xl border border-white/10 bg-black/20 p-3"
                      style={{ animationDelay: `${i * 70}ms` }}
                    >
                      <p className="text-[10px] tracking-wider text-slate-400 uppercase">{item.label}</p>
                      <p className="mt-1 text-lg font-semibold text-white">{item.value}</p>
                      {item.caption && (
                        <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{item.caption}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {visual.labels.length >= 2 && (
                <DiagramCanvas layout={visual.layout} labels={visual.labels} />
              )}

              {visual.cards.length > 0 && (
                <div className="grid gap-3 p-4 sm:grid-cols-2">
                  {visual.cards.map((card, i) => (
                    <div
                      key={`${card.title}-${i}`}
                      className="consult-visual-node overflow-hidden rounded-xl border border-white/10 bg-black/20 shadow-xl"
                      style={{ animationDelay: `${120 + i * 80}ms` }}
                    >
                      <div
                        className={`bg-gradient-to-r px-4 py-2 text-xs font-semibold text-white shadow-lg ${TONE_CLASS[card.tone ?? "cyan"]}`}
                      >
                        {card.title}
                      </div>
                      <p className="px-4 py-3 text-xs leading-relaxed text-slate-300">{card.body}</p>
                    </div>
                  ))}
                </div>
              )}

              {visual.bullets.length > 0 && (
                <ul className="space-y-2 border-t border-white/8 px-5 py-4">
                  {visual.bullets.map((bullet) => (
                    <li key={bullet} className="flex gap-2 text-xs leading-relaxed text-slate-300">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-300" />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
