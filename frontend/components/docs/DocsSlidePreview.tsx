"use client";

import type { DocOutline, DocSlideOutline, DocSlideVisual } from "@/lib/types/docs";

const layoutLabels: Record<DocSlideOutline["layout"], string> = {
  title: "表紙",
  section: "章扉",
  content: "本文",
  twoColumn: "2列",
  cards: "カード",
  stat: "KPI",
  closing: "まとめ",
};

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

function KeyMessage({ text, dark }: { text: string; dark?: boolean }) {
  return (
    <p
      className={`mt-1.5 rounded border-l-2 px-2 py-1 text-[10px] leading-snug ${
        dark
          ? "border-[#0BD0D9] bg-white/10 text-[#9DD4CF]"
          : "border-[#0BD0D9] bg-[#E8F4F8] text-[#156082]"
      }`}
    >
      {text}
    </p>
  );
}

function SlideCard({ slide, index }: { slide: DocSlideOutline; index: number }) {
  const isTitle = slide.layout === "title";
  const isSection = slide.layout === "section";
  const isClosing = slide.layout === "closing";
  const isDark = isTitle || isClosing || isSection;
  const layoutLabel = layoutLabels[slide.layout];

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-xl border ${
        isTitle
          ? "border-[#156082]/40 bg-gradient-to-br from-[#0E2841] to-[#156082]"
          : isSection
            ? "border-[#156082]/35 bg-gradient-to-br from-[#156082] to-[#0E2841]"
            : isClosing
              ? "border-[#156082]/30 bg-[#0E2841]"
              : "border-[#467886]/25 bg-white"
      }`}
    >
      {!isTitle && !isSection && (
        <div className="flex items-center gap-1.5 bg-[#0E2841] px-2 py-1.5">
          <div className="h-3 w-0.5 shrink-0 bg-[#0BD0D9]" />
          <p className="flex-1 truncate text-[11px] font-semibold text-white">{slide.title}</p>
          <span className="rounded bg-[#156082]/60 px-1 py-0.5 text-[7px] text-[#9DD4CF]">
            {layoutLabel}
          </span>
          {slide.visual && (
            <span className="rounded bg-[#156082]/60 px-1 py-0.5 text-[7px] text-[#9DD4CF]">
              {visualTypeLabels[slide.visual.type]}
            </span>
          )}
        </div>
      )}

      <div className={`flex flex-1 flex-col px-3 pb-3 ${isTitle || isSection ? "pt-3" : "pt-2"}`}>
        {(isTitle || isSection) && (
          <>
            <div className="mb-2 h-0.5 w-12 bg-[#0BD0D9]" />
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#9DD4CF]">
              {index + 1}. {layoutLabel}
            </p>
          </>
        )}

        {(isTitle || isSection) && (
          <p className="mt-1 text-sm font-bold text-white">{slide.title}</p>
        )}

        {slide.subtitle && (
          <p className={`mt-1 text-xs ${isDark ? "text-[#9DD4CF]" : "text-[#467886]"}`}>
            {slide.subtitle}
          </p>
        )}

        {slide.keyMessage && <KeyMessage text={slide.keyMessage} dark={isDark} />}

        {slide.image?.query ? (
          <div
            className={`mt-2 overflow-hidden rounded border ${
              isDark ? "border-white/20 bg-white/10" : "border-[#467886]/30 bg-[#E8F4F8]"
            }`}
          >
            <div
              className={`flex h-14 items-end bg-gradient-to-br from-[#156082] via-[#0F9ED5] to-[#0BD0D9] px-2 pb-1.5 ${
                slide.image.placement === "hero" ? "h-16" : ""
              }`}
            >
              <span className="rounded bg-black/35 px-1.5 py-0.5 text-[7px] text-white">
                画像 · {slide.image.placement === "hero" ? "ヒーロー" : "サイド"} ·{" "}
                {slide.image.query}
              </span>
            </div>
          </div>
        ) : null}

        {slide.layout === "twoColumn" && slide.columns && slide.columns.length >= 2 ? (
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {slide.columns.slice(0, 2).map((col, i) => (
              <div
                key={col.title}
                className={`overflow-hidden rounded border border-[#467886]/30 ${
                  i === 0 ? "bg-[#E8F4F8]" : "bg-white"
                }`}
              >
                <div
                  className={`px-1.5 py-0.5 text-[8px] font-semibold text-white ${
                    i === 0 ? "bg-[#467886]" : "bg-[#156082]"
                  }`}
                >
                  {col.title}
                </div>
                <ul className="space-y-0.5 p-1.5 text-[9px] text-slate-600">
                  {col.bullets.slice(0, 3).map((b) => (
                    <li key={b} className="flex gap-1">
                      <span className="text-[#0BD0D9]">•</span>
                      <span className="line-clamp-2">{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : null}

        {slide.layout === "cards" && slide.bullets.length > 0 ? (
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {slide.bullets.slice(0, 4).map((title, i) => (
              <div
                key={title}
                className="overflow-hidden rounded border border-[#467886]/25 bg-white"
              >
                <div className={`h-0.5 ${BLUE_HEADERS[i % BLUE_HEADERS.length]}`} />
                <p className="px-1.5 pt-1 text-[9px] font-semibold text-[#0E2841]">{title}</p>
                {slide.cardDetails?.[i] ? (
                  <p className="line-clamp-2 px-1.5 pb-1 text-[8px] text-slate-500">
                    {slide.cardDetails[i]}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {slide.layout === "stat" && slide.stats && slide.stats.length > 0 ? (
          <div className="mt-2 flex gap-1.5">
            {slide.stats.slice(0, 4).map((stat, i) => (
              <div
                key={`${stat.label}-${i}`}
                className="flex-1 overflow-hidden rounded border border-[#467886]/25 bg-white text-center"
              >
                <div className={`h-0.5 ${BLUE_HEADERS[i % BLUE_HEADERS.length]}`} />
                <p className="px-0.5 pt-1.5 text-[11px] font-bold text-[#0E2841]">{stat.value}</p>
                <p className="line-clamp-2 px-0.5 pb-1 text-[7px] text-slate-500">{stat.label}</p>
              </div>
            ))}
          </div>
        ) : null}

        {(() => {
          const structured =
            (slide.layout === "twoColumn" && (slide.columns?.length ?? 0) >= 2) ||
            (slide.layout === "cards" && slide.bullets.length > 0) ||
            (slide.layout === "stat" && (slide.stats?.length ?? 0) > 0);
          if (structured || slide.bullets.length === 0) return null;
          return (
            <ul
              className={`mt-2 space-y-1 text-xs ${
                isClosing || isSection
                  ? "text-blue-50"
                  : isTitle
                    ? "text-blue-100"
                    : "text-slate-600"
              }`}
            >
              {slide.bullets.map((item) => (
                <li key={item} className="flex gap-1.5">
                  <span className="text-[#0BD0D9]">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          );
        })()}

        {slide.visual && slide.layout !== "cards" && slide.layout !== "stat" && (
          <VisualPreview visual={slide.visual} />
        )}
      </div>

      {!isTitle && !isSection && <div className="h-0.5 bg-[#156082]" />}
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
        {outline.documentTitle} — {outline.slides.length} 枚 · 青系テンプレート（カード/2列/KPI/画像）
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {outline.slides.map((slide, index) => (
          <SlideCard key={`${slide.title}-${index}`} slide={slide} index={index} />
        ))}
      </div>
    </div>
  );
}
