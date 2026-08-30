"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import AsteroidShowcaseDemo from "@/components/showcase/demos/AsteroidShowcaseDemo";
import CouncilShowcaseDemo from "@/components/showcase/demos/CouncilShowcaseDemo";
import DisneyShowcaseDemo from "@/components/showcase/demos/DisneyShowcaseDemo";
import JudicialShowcaseDemo from "@/components/showcase/demos/JudicialShowcaseDemo";
import SankeyShowcaseDemo from "@/components/showcase/demos/SankeyShowcaseDemo";
import SolunaShowcaseDemo from "@/components/showcase/demos/SolunaShowcaseDemo";
import StocksShowcaseDemo from "@/components/showcase/demos/StocksShowcaseDemo";
import { SHOWCASE_SECTIONS, type ShowcaseSectionMeta } from "@/lib/showcase-data";

const DEMO_MAP = {
  sankey: SankeyShowcaseDemo,
  judicial: JudicialShowcaseDemo,
  council: CouncilShowcaseDemo,
  stocks: StocksShowcaseDemo,
  disney: DisneyShowcaseDemo,
  asteroid: AsteroidShowcaseDemo,
  soluna: SolunaShowcaseDemo,
} as const;

function ShowcaseSection({
  section,
  children,
  onVisible,
}: {
  section: ShowcaseSectionMeta;
  children: React.ReactNode;
  onVisible: (id: string) => void;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) onVisible(section.id);
      },
      { threshold: 0.45 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [onVisible, section.id]);

  return (
    <section
      ref={ref}
      id={section.id}
      className="showcase-section scroll-mt-20"
      style={{ ["--showcase-accent" as string]: section.accent }}
    >
      <div className="showcase-section__bg" aria-hidden />
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:gap-12 lg:py-20">
        <div className="showcase-section__copy">
          <p className="font-mono text-[11px] tracking-[0.22em] text-slate-500">
            {section.index} — {section.tag}
          </p>
          <h2 className="display-section mt-4 text-white">{section.titleJa}</h2>
          <p className="mt-2 font-display text-sm uppercase tracking-[0.18em] text-slate-500">
            {section.title}
          </p>
          <p className="mt-5 max-w-lg text-sm leading-7 text-slate-400">{section.description}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            {section.publicHref ? (
              <Link
                href={section.publicHref}
                className="showcase-section__link inline-flex items-center gap-2 rounded-full border border-fuchsia-400/35 bg-fuchsia-500/15 px-4 py-2 text-sm text-fuchsia-100 transition hover:border-fuchsia-400/50 hover:bg-fuchsia-500/25"
              >
                無料プレビューを見る
                <span aria-hidden>→</span>
              </Link>
            ) : null}
            <Link
              href={section.href}
              className="showcase-section__link inline-flex items-center gap-2 rounded-full border border-white/12 px-4 py-2 text-sm text-slate-200 transition hover:border-white/25 hover:bg-white/5"
            >
              {section.publicHref ? "ログイン後にフル版" : "ログイン後に開く"}
              <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
        <div className="showcase-section__demo">{children}</div>
      </div>
    </section>
  );
}

export default function StudioShowcase() {
  const [activeId, setActiveId] = useState<string>("intro");
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={containerRef} className="showcase-scroll">
      <nav className="showcase-progress" aria-label="セクション">
        {["intro", ...SHOWCASE_SECTIONS.map((s) => s.id)].map((id) => (
          <a
            key={id}
            href={id === "intro" ? "#intro" : `#${id}`}
            className={`showcase-progress__dot ${activeId === id ? "is-active" : ""}`}
            aria-label={id}
          />
        ))}
      </nav>

      <section id="intro" className="showcase-hero">
        <div className="showcase-hero__film" aria-hidden />
        <div className="relative mx-auto flex min-h-[78vh] w-full max-w-6xl flex-col justify-center px-4 py-20 sm:px-6">
          <p className="eyebrow flex items-center gap-3">
            <span className="home-pulse-dot h-1.5 w-1.5 rounded-full bg-cyan-300" />
            AQUA Studio — Showcase
          </p>
          <h1 className="display-hero mt-8 max-w-4xl text-white">
            <span className="block ink-gradient">Personal Software</span>
            <span className="mt-2 block ink-soft">in Motion</span>
          </h1>
          <p className="mt-8 max-w-2xl text-[15px] leading-7 text-slate-400">
            認証なしで、AQUA STUDIO の{SHOWCASE_SECTIONS.length}つのモジュールを体感できます。
            スクロールで流れるように、動く画面をご覧ください。
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="#sankey"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-300/90 to-teal-200/90 px-5 py-2.5 text-sm font-medium text-slate-950 transition hover:from-cyan-200 hover:to-teal-100"
            >
              ショーケースを見る
              <span aria-hidden>↓</span>
            </a>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-full border border-white/12 px-5 py-2.5 text-sm font-medium text-slate-300 transition hover:border-white/25 hover:bg-white/5"
            >
              ログインして使う
            </Link>
          </div>
          <p className="mt-12 text-xs text-slate-500">
            Scroll — {SHOWCASE_SECTIONS.length} modules · demo data only
          </p>
        </div>
      </section>

      {SHOWCASE_SECTIONS.map((section) => {
        const Demo = DEMO_MAP[section.id as keyof typeof DEMO_MAP];
        return (
          <ShowcaseSection key={section.id} section={section} onVisible={setActiveId}>
            <Demo />
          </ShowcaseSection>
        );
      })}

      <section className="showcase-outro">
        <div className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6">
          <p className="eyebrow">AQUA Personal Software Studio</p>
          <h2 className="display-section mt-4 text-white">あなたの研究と挑戦を、AI と一緒に。</h2>
          <p className="mt-4 text-sm leading-7 text-slate-400">
            ショーケースはデモデータです。実際のデータ連携・AI 合議・3D シミュレーションはログイン後にご利用ください。
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-300/90 to-teal-200/90 px-5 py-2.5 text-sm font-medium text-slate-950 transition hover:from-cyan-200 hover:to-teal-100"
            >
              ログイン
            </Link>
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full border border-white/12 px-5 py-2.5 text-sm font-medium text-slate-300 transition hover:border-white/25 hover:bg-white/5"
            >
              ホームへ
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
