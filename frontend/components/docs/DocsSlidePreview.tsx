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
  icons: "構成図",
} as const;

/** サンプルPPT準拠の青系パレット */
const BLUE_HEADERS = [
  "bg-[#0E2841]",
  "bg-[#156082]",
  "bg-[#0F9ED5]",
  "bg-[#0BD0D9]",
  "bg-[#467886]",
];

function ArchBoxPreview({
  label,
  headerClass,
  bodyClass = "bg-white",
}: {
  label: string;
  headerClass: string;
  bodyClass?: string;
}) {
  return (
    <div className={`overflow-hidden rounded border border-[#467886]/50 ${bodyClass}`}>
      <div className={`px-1 py-0.5 text-center text-[8px] font-semibold text-white ${headerClass}`}>
        {label}
      </div>
      <div className="h-1.5 bg-[#0BD0D9]/20" />
    </div>
  );
}

function VisualPreview({ visual }: { visual: DocSlideVisual }) {
  const labels = visual.labels.slice(0, 5);

  if (visual.type === "flow") {
    return (
      <div className="mt-2 rounded border border-[#467886]/30 bg-[#E8E8E8]/40 p-1.5">
        <div className="flex items-center gap-0.5 overflow-x-auto">
          {labels.map((label, i) => (
            <div key={label} className="flex shrink-0 items-center gap-0.5">
              <div className="w-12">
                <ArchBoxPreview label={label} headerClass={BLUE_HEADERS[i % BLUE_HEADERS.length]} />
              </div>
              {i < labels.length - 1 && <span className="text-[10px] text-[#0BD0D9]">→</span>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (visual.type === "comparison") {
    return (
      <div className="mt-2 rounded border border-[#467886]/30 bg-[#E8E8E8]/40 p-1.5">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1">
          <ArchBoxPreview label={labels[0] ?? ""} headerClass="bg-[#467886]" bodyClass="bg-[#D6EAF5]" />
          <span className="text-[#0BD0D9]">→</span>
          <ArchBoxPreview label={labels[1] ?? ""} headerClass="bg-[#156082]" />
        </div>
      </div>
    );
  }

  if (visual.type === "timeline") {
    return (
      <div className="mt-2 rounded border border-[#467886]/30 bg-[#E8E8E8]/40 p-1.5">
        <div className="relative flex items-start justify-between pt-2">
          <div className="absolute left-1 right-1 top-3 h-0.5 bg-[#0BD0D9]" />
          {labels.map((label, i) => (
            <div key={label} className="relative z-10 flex flex-1 flex-col items-center">
              <div
                className={`flex h-3 w-3 items-center justify-center rounded-full text-[7px] font-bold text-white ${BLUE_HEADERS[i % BLUE_HEADERS.length]}`}
              >
                {i + 1}
              </div>
              <span className="mt-0.5 rounded border border-[#467886]/40 bg-white px-0.5 text-center text-[7px] text-slate-600">
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (visual.type === "pyramid") {
    return (
      <div className="mt-2 rounded border border-[#467886]/30 bg-[#E8E8E8]/40 p-1.5">
        <div className="flex flex-col items-center gap-0.5">
          {labels.map((label, i) => (
            <div
              key={label}
              className={`rounded px-2 py-0.5 text-center text-[8px] font-semibold text-white ${BLUE_HEADERS[Math.min(i, BLUE_HEADERS.length - 1)]}`}
              style={{ width: `${100 - i * 14}%` }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 rounded border border-[#467886]/30 bg-[#E8E8E8]/40 p-1.5">
      <div className="grid grid-cols-2 gap-1">
        {labels.map((label, i) => (
          <ArchBoxPreview key={label} label={label} headerClass={BLUE_HEADERS[i % BLUE_HEADERS.length]} />
        ))}
      </div>
    </div>
  );
}

function SlideCard({ slide, index }: { slide: DocSlideOutline; index: number }) {
  const isTitle = slide.layout === "title";
  const isClosing = slide.layout === "closing";
  const isDark = isTitle || isClosing;

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-xl border ${
        isTitle
          ? "border-[#156082]/40 bg-gradient-to-br from-[#0E2841] to-[#156082]"
          : isClosing
            ? "border-[#156082]/30 bg-[#0E2841]"
            : "border-[#467886]/25 bg-white"
      }`}
    >
      {!isTitle && (
        <div className="flex items-center gap-1.5 bg-[#0E2841] px-2 py-1.5">
          <div className="h-3 w-0.5 shrink-0 bg-[#0BD0D9]" />
          <p className="flex-1 truncate text-[11px] font-semibold text-white">{slide.title}</p>
          {slide.visual && (
            <span className="rounded bg-[#156082]/60 px-1 py-0.5 text-[7px] text-[#9DD4CF]">
              {visualTypeLabels[slide.visual.type]}
            </span>
          )}
        </div>
      )}

      <div className={`flex flex-1 flex-col px-3 pb-3 ${isTitle ? "pt-3" : "pt-2"}`}>
        {isTitle && (
          <>
            <div className="mb-2 h-0.5 w-12 bg-[#0BD0D9]" />
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9DD4CF]">
              {index + 1}. {layoutLabels[slide.layout]}
            </p>
          </>
        )}

        {isTitle && (
          <p className="mt-1 text-sm font-bold text-white">{slide.title}</p>
        )}

        {slide.subtitle && (
          <p className={`mt-1 text-xs ${isDark ? "text-[#9DD4CF]" : "text-[#467886]"}`}>
            {slide.subtitle}
          </p>
        )}

        {slide.bullets.length > 0 && (
          <ul
            className={`mt-2 space-y-1 text-xs ${
              isClosing ? "text-blue-50" : isTitle ? "text-blue-100" : "text-slate-600"
            }`}
          >
            {slide.bullets.map((item) => (
              <li key={item} className="flex gap-1.5">
                <span className="text-[#0BD0D9]">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        )}

        {slide.visual && <VisualPreview visual={slide.visual} />}
      </div>

      {!isTitle && (
        <div className="h-0.5 bg-[#156082]" />
      )}
    </div>
  );
}

type DocsSlidePreviewProps = {
  outline: DocOutline;
};

export default function DocsSlidePreview({ outline }: DocsSlidePreviewProps) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-[0.25em] text-[#0BD0D9]/80">
        スライドプレビュー
      </h3>
      <p className="mt-1 text-xs text-slate-500">
        {outline.documentTitle} — {outline.slides.length} 枚 · 青系テンプレート
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {outline.slides.map((slide, index) => (
          <SlideCard key={`${slide.title}-${index}`} slide={slide} index={index} />
        ))}
      </div>
    </div>
  );
}
