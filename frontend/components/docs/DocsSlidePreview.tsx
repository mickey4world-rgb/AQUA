"use client";

import type { DocCloudArchitecture, DocOutline, DocSlideOutline, DocSlideVisual } from "@/lib/types/docs";

const layoutLabels: Record<DocSlideOutline["layout"], string> = {
  title: "è¡¨ç´",
  section: "ç« æ",
  content: "æ¬æ",
  twoColumn: "2å",
  cards: "ã«ã¼ã",
  stat: "KPI",
  cloudArch: "ã¯ã©ã¦ãæ§æ",
  azureArch: "Azureæ§æ",
  closing: "ã¾ã¨ã",
};

const visualTypeLabels = {
  flow: "ãã­ã¼",
  comparison: "æ¯è¼",
  timeline: "ã¿ã¤ã ã©ã¤ã³",
  pyramid: "ãã©ããã",
  icons: "æ§æå³",
} as const;

const BLUE_HEADERS = [
  "bg-[#0F4568]",
  "bg-[#1A8CA6]",
  "bg-[#2BB3C9]",
  "bg-[#3DD5E0]",
  "bg-[#5BA3B5]",
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
    <div className={`overflow-hidden rounded border border-[#5BA3B5]/50 ${bodyClass}`}>
      <div className={`px-1 py-0.5 text-center text-[8px] font-semibold text-white ${headerClass}`}>
        {label}
      </div>
      <div className="h-1.5 bg-[#3DD5E0]/20" />
    </div>
  );
}

function VisualPreview({ visual }: { visual: DocSlideVisual }) {
  const labels = visual.labels.slice(0, 5);

  if (visual.type === "flow") {
    return (
      <div className="mt-2 rounded border border-[#5BA3B5]/30 bg-[#F0F7F9]/70 p-1.5">
        <div className="flex items-center gap-0.5 overflow-x-auto">
          {labels.map((label, i) => (
            <div key={label} className="flex shrink-0 items-center gap-0.5">
              <div className="w-12">
                <ArchBoxPreview label={label} headerClass={BLUE_HEADERS[i % BLUE_HEADERS.length]} />
              </div>
              {i < labels.length - 1 && <span className="text-[10px] text-[#3DD5E0]">â</span>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (visual.type === "comparison") {
    return (
      <div className="mt-2 rounded border border-[#5BA3B5]/30 bg-[#F0F7F9]/70 p-1.5">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1">
          <ArchBoxPreview label={labels[0] ?? ""} headerClass="bg-[#5BA3B5]" bodyClass="bg-[#E3F5FA]" />
          <span className="text-[#3DD5E0]">â</span>
          <ArchBoxPreview label={labels[1] ?? ""} headerClass="bg-[#1A8CA6]" />
        </div>
      </div>
    );
  }

  if (visual.type === "timeline") {
    return (
      <div className="mt-2 rounded border border-[#5BA3B5]/30 bg-[#F0F7F9]/70 p-1.5">
        <div className="relative flex items-start justify-between pt-2">
          <div className="absolute left-1 right-1 top-3 h-0.5 bg-[#3DD5E0]" />
          {labels.map((label, i) => (
            <div key={label} className="relative z-10 flex flex-1 flex-col items-center">
              <div
                className={`flex h-3 w-3 items-center justify-center rounded-full text-[7px] font-bold text-white ${BLUE_HEADERS[i % BLUE_HEADERS.length]}`}
              >
                {i + 1}
              </div>
              <span className="mt-0.5 rounded border border-[#5BA3B5]/40 bg-white px-0.5 text-center text-[7px] text-slate-600">
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
      <div className="mt-2 rounded border border-[#5BA3B5]/30 bg-[#F0F7F9]/70 p-1.5">
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
    <div className="mt-2 rounded border border-[#5BA3B5]/30 bg-[#F0F7F9]/70 p-1.5">
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
          ? "border-[#3DD5E0] bg-white/10 text-[#B8EDE6]"
          : "border-[#3DD5E0] bg-[#E3F5FA] text-[#1A8CA6]"
      }`}
    >
      {text}
    </p>
  );
}

function formatYen(n: number): string {
  return `Â¥${Math.round(n).toLocaleString("ja-JP")}`;
}

function CloudArchPreview({ arch }: { arch: DocCloudArchitecture }) {
  const provider = arch.provider === "aws" ? "AWS" : "Azure";
  const iconBase = arch.provider === "aws" ? "/docs/aws-icons" : "/docs/azure-icons";
  const total = arch.totalMonthlyJpy ?? arch.nodes.reduce((a, n) => a + (n.monthlyCostJpy ?? 0), 0);
  return (
    <div className="mt-2 rounded border border-[#5BA3B5]/30 bg-[#F0F7F9] p-1.5">
      <p className="mb-1 text-[7px] text-[#4F7F8F]">
        {arch.caption ?? `æ³å® ${provider} æ§æ`} Â· {provider} å¬å¼ã¢ã¤ã³ã³
      </p>
      <div className="flex flex-wrap gap-1">
        {arch.nodes.slice(0, 8).map((n) => (
          <div
            key={n.id}
            className="min-w-[3.2rem] flex-1 rounded border border-[#5BA3B5]/35 bg-white px-1 py-1 text-center"
          >
            <img
              src={`${iconBase}/${n.service}.png`}
              alt={n.service}
              width={20}
              height={20}
              className="mx-auto mb-0.5 h-5 w-5 object-contain"
              loading="lazy"
            />
            <p className="text-[8px] font-semibold text-[#0F4568]">{n.label}</p>
            <p className="truncate text-[6px] text-slate-500">{n.service}</p>
            {typeof n.monthlyCostJpy === "number" ? (
              <p className="text-[6px] font-semibold text-[#1A8CA6]">
                {formatYen(n.monthlyCostJpy)}
              </p>
            ) : null}
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex items-center justify-between rounded bg-white px-1.5 py-1">
        <span className="text-[7px] text-[#4F7F8F]">æé¡æ³å®åè¨ï¼æ¦ç®ï¼</span>
        <span className="text-[10px] font-bold text-[#1A8CA6]">{formatYen(total)}</span>
      </div>
    </div>
  );
}

function SlideCard({ slide, index }: { slide: DocSlideOutline; index: number }) {
  const isTitle = slide.layout === "title";
  const isSection = slide.layout === "section";
  const isClosing = slide.layout === "closing";
  const isDark = isTitle || isClosing || isSection;
  const layoutLabel = layoutLabels[slide.layout];
  const arch = slide.cloudArch ?? slide.azureArch;
  const hasCloud = (arch?.nodes.length ?? 0) >= 3;

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-xl border ${
        isTitle
          ? "border-[#1A8CA6]/40 bg-gradient-to-br from-[#0F4568] to-[#1A8CA6]"
          : isSection
            ? "border-[#1A8CA6]/35 bg-gradient-to-br from-[#1A8CA6] to-[#0F4568]"
            : isClosing
              ? "border-[#1A8CA6]/30 bg-[#0F4568]"
              : "border-[#5BA3B5]/25 bg-white"
      }`}
    >
      {!isTitle && !isSection && (
        <div className="flex items-center gap-1.5 bg-[#0F4568] px-2 py-1.5">
          <div className="h-3 w-0.5 shrink-0 bg-[#3DD5E0]" />
          <p className="flex-1 truncate text-[11px] font-semibold text-white">{slide.title}</p>
          <span className="rounded bg-[#1A8CA6]/60 px-1 py-0.5 text-[7px] text-[#B8EDE6]">
            {layoutLabel}
          </span>
        </div>
      )}

      <div className={`flex flex-1 flex-col px-3 pb-3 ${isTitle || isSection ? "pt-3" : "pt-2"}`}>
        {(isTitle || isSection) && (
          <>
            <div className="mb-2 h-0.5 w-12 bg-[#3DD5E0]" />
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#B8EDE6]">
              {index + 1}. {layoutLabel}
            </p>
          </>
        )}

        {(isTitle || isSection) && (
          <p className="mt-1 text-sm font-bold text-white">{slide.title}</p>
        )}

        {slide.subtitle && (
          <p className={`mt-1 text-xs ${isDark ? "text-[#B8EDE6]" : "text-[#4F7F8F]"}`}>
            {slide.subtitle}
          </p>
        )}

        {slide.keyMessage && <KeyMessage text={slide.keyMessage} dark={isDark} />}

        {hasCloud && arch ? <CloudArchPreview arch={arch} /> : null}

        {!hasCloud && slide.image?.query ? (
          <div
            className={`mt-2 overflow-hidden rounded border ${
              isDark ? "border-white/20 bg-white/10" : "border-[#5BA3B5]/30 bg-[#E3F5FA]"
            }`}
          >
            <div className="flex h-14 items-end bg-gradient-to-br from-[#1A8CA6] via-[#2BB3C9] to-[#3DD5E0] px-2 pb-1.5">
              <span className="rounded bg-black/35 px-1.5 py-0.5 text-[7px] text-white">
                ç»å Â· {slide.image.query}
              </span>
            </div>
          </div>
        ) : null}

        {slide.layout === "twoColumn" && slide.columns && slide.columns.length >= 2 ? (
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {slide.columns.slice(0, 2).map((col, i) => (
              <div
                key={col.title}
                className={`overflow-hidden rounded border border-[#5BA3B5]/30 ${
                  i === 0 ? "bg-[#E3F5FA]" : "bg-white"
                }`}
              >
                <div
                  className={`px-1.5 py-0.5 text-[8px] font-semibold text-white ${
                    i === 0 ? "bg-[#5BA3B5]" : "bg-[#1A8CA6]"
                  }`}
                >
                  {col.title}
                </div>
                <ul className="space-y-0.5 p-1.5 text-[9px] text-slate-600">
                  {col.bullets.slice(0, 3).map((b) => (
                    <li key={b} className="flex gap-1">
                      <span className="text-[#3DD5E0]">â¢</span>
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
              <div key={title} className="overflow-hidden rounded border border-[#5BA3B5]/25 bg-white">
                <div className={`h-0.5 ${BLUE_HEADERS[i % BLUE_HEADERS.length]}`} />
                <p className="px-1.5 pt-1 text-[9px] font-semibold text-[#0F4568]">{title}</p>
              </div>
            ))}
          </div>
        ) : null}

        {slide.layout === "stat" && slide.stats && slide.stats.length > 0 ? (
          <div className="mt-2 flex gap-1.5">
            {slide.stats.slice(0, 4).map((stat, i) => (
              <div
                key={`${stat.label}-${i}`}
                className="flex-1 overflow-hidden rounded border border-[#5BA3B5]/25 bg-white text-center"
              >
                <div className={`h-0.5 ${BLUE_HEADERS[i % BLUE_HEADERS.length]}`} />
                <p className="px-0.5 pt-1.5 text-[11px] font-bold text-[#0F4568]">{stat.value}</p>
                <p className="line-clamp-2 px-0.5 pb-1 text-[7px] text-slate-500">{stat.label}</p>
              </div>
            ))}
          </div>
        ) : null}

        {(() => {
          const structured =
            (slide.layout === "twoColumn" && (slide.columns?.length ?? 0) >= 2) ||
            (slide.layout === "cards" && slide.bullets.length > 0) ||
            (slide.layout === "stat" && (slide.stats?.length ?? 0) > 0) ||
            hasCloud;
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
                  <span className="text-[#3DD5E0]">â¢</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          );
        })()}

        {slide.visual && !hasCloud && slide.layout !== "cards" && slide.layout !== "stat" && (
          <VisualPreview visual={slide.visual} />
        )}
      </div>

      {!isTitle && !isSection && <div className="h-0.5 bg-[#1A8CA6]" />}
    </div>
  );
}

type DocsSlidePreviewProps = {
  outline: DocOutline;
};

export default function DocsSlidePreview({ outline }: DocsSlidePreviewProps) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-[0.25em] text-[#3DD5E0]/80">
        ã¹ã©ã¤ããã¬ãã¥ã¼
      </h3>
      <p className="mt-1 text-xs text-slate-500">
        {outline.documentTitle} â {outline.slides.length} æ Â· Azure/AWS æ§æã»è²»ç¨å¯¾å¿
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {outline.slides.map((slide, index) => (
          <SlideCard key={`${slide.title}-${index}`} slide={slide} index={index} />
        ))}
      </div>
    </div>
  );
}
