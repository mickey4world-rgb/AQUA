"use client";

import type { DocOutline, DocSlideOutline } from "@/lib/types/docs";

const layoutLabels = {
  title: "表紙",
  content: "本文",
  closing: "まとめ",
} as const;

function SlideCard({ slide, index }: { slide: DocSlideOutline; index: number }) {
  const isTitle = slide.layout === "title";

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-xl border ${
        isTitle || slide.layout === "closing"
          ? "border-blue-400/30 bg-gradient-to-br from-[#1B2A4A] to-[#2563EB]"
          : "border-white/10 bg-white/[0.04]"
      }`}
    >
      <div
        className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-wider ${
          isTitle || slide.layout === "closing" ? "text-blue-200" : "text-slate-500"
        }`}
      >
        {index + 1}. {layoutLabels[slide.layout]}
      </div>
      <div className="flex flex-1 flex-col px-3 pb-3">
        <p
          className={`text-sm font-semibold ${
            isTitle || slide.layout === "closing" ? "text-white" : "text-slate-100"
          }`}
        >
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
