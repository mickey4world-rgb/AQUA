"use client";

import type { DocOutline, DocSlideOutline, DocSlideVisual } from "@/lib/types/docs";

const layoutLabels = {
  title: "表紙",
  content: "本文",
  closing: "まとめ",
} as const;

const visualTypeLabels = {
  flow: "フロー",
  comparison: "比較",
  timeline: "タイムライン",
  pyramid: "ピラミッド",
  icons: "アイコン",
} as const;

const iconColors = [
  "bg-blue-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-violet-500",
  "bg-pink-500",
];

function VisualPreview({ visual, dark }: { visual: DocSlideVisual; dark?: boolean }) {
  const labels = visual.labels.slice(0, 5);
  const textCls = dark ? "text-blue-50" : "text-slate-300";
  const borderCls = dark ? "border-blue-400/40" : "border-white/15";

  if (visual.type === "flow") {
    return (
      <div className="mt-2 flex items-center gap-1 overflow-x-auto">
        {labels.map((label, i) => (
          <div key={label} className="flex shrink-0 items-center gap-1">
            <span className={`rounded px-1.5 py-0.5 text-[9px] ${borderCls} border bg-blue-500/20 ${textCls}`}>
              {label}
            </span>
            {i < labels.length - 1 && <span className="text-[10px] text-blue-400">→</span>}
          </div>
        ))}
      </div>
    );
  }

  if (visual.type === "comparison") {
    return (
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {labels.slice(0, 2).map((label, i) => (
          <div
            key={label}
            className={`rounded border px-1.5 py-1 text-center text-[9px] ${textCls} ${
              i === 0 ? "border-blue-400/50 bg-blue-500/15" : "border-amber-400/50 bg-amber-500/15"
            }`}
          >
            {label}
          </div>
        ))}
      </div>
    );
  }

  if (visual.type === "timeline") {
    return (
      <div className="mt-2 flex items-start justify-between gap-0.5">
        {labels.map((label, i) => (
          <div key={label} className="flex flex-1 flex-col items-center">
            <div className={`h-2 w-2 rounded-full ${iconColors[i % iconColors.length]}`} />
            <span className={`mt-0.5 text-center text-[8px] leading-tight ${textCls}`}>{label}</span>
          </div>
        ))}
      </div>
    );
  }

  if (visual.type === "pyramid") {
    return (
      <div className="mt-2 flex flex-col items-center gap-0.5">
        {labels.map((label, i) => (
          <div
            key={label}
            className={`rounded px-2 py-0.5 text-center text-[9px] text-white ${iconColors[i % iconColors.length]}`}
            style={{ width: `${100 - i * 15}%` }}
          >
            {label}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {labels.map((label, i) => (
        <div key={label} className="flex flex-col items-center">
          <div className={`h-3 w-6 rounded ${iconColors[i % iconColors.length]}`} />
          <span className={`mt-0.5 text-[8px] ${textCls}`}>{label}</span>
        </div>
      ))}
    </div>
  );
}

function SlideCard({ slide, index }: { slide: DocSlideOutline; index: number }) {
  const isTitle = slide.layout === "title";
  const isDark = isTitle || slide.layout === "closing";

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-xl border ${
        isDark
          ? "border-blue-400/30 bg-gradient-to-br from-[#1B2A4A] to-[#2563EB]"
          : "border-white/10 bg-white/[0.04]"
      }`}
    >
      <div
        className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-wider ${
          isDark ? "text-blue-200" : "text-slate-500"
        }`}
      >
        {index + 1}. {layoutLabels[slide.layout]}
        {slide.visual && (
          <span className="ml-1.5 rounded bg-blue-500/20 px-1 py-0.5 text-[8px] normal-case tracking-normal text-blue-300">
            {visualTypeLabels[slide.visual.type]}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col px-3 pb-3">
        <p className={`text-sm font-semibold ${isDark ? "text-white" : "text-slate-100"}`}>
          {slide.title}
        </p>
        {slide.subtitle && (
          <p className="mt-1 text-xs text-blue-200/80">{slide.subtitle}</p>
        )}
        {slide.bullets.length > 0 && (
          <ul
            className={`mt-2 space-y-1 text-xs ${
              slide.layout === "closing" ? "text-blue-50" : "text-slate-400"
            }`}
          >
            {slide.bullets.map((item) => (
              <li key={item} className="flex gap-1.5">
                <span className="text-blue-400">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        )}
        {slide.visual && <VisualPreview visual={slide.visual} dark={isDark} />}
      </div>
    </div>
  );
}

type DocsSlidePreviewProps = {
  outline: DocOutline;
};

export default function DocsSlidePreview({ outline }: DocsSlidePreviewProps) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-[0.25em] text-blue-300/80">
        スライドプレビュー
      </h3>
      <p className="mt-1 text-xs text-slate-500">
        {outline.documentTitle} — {outline.slides.length} 枚
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {outline.slides.map((slide, index) => (
          <SlideCard key={`${slide.title}-${index}`} slide={slide} index={index} />
        ))}
      </div>
    </div>
  );
}
