import Link from "next/link";
import type { Metadata } from "next";
import HomePageShell from "@/components/home/HomePageShell";
import Reveal from "@/components/layout/Reveal";

export const metadata: Metadata = {
  title: "清水健利（Taketoshi Shimizu）— 最高裁PM / 内閣官房デジタルアドバイザー | AQUA",
  description:
    "清水健利（Taketoshi Shimizu）。最高裁判所 司法DX推進プロジェクトマネージャー、内閣官房 行政改革・効率化推進事務局 デジタルアドバイザー。国家の公的基盤に最先端クラウドと生成AIを実装する人材。AQUA studio 製作者。",
  alternates: { canonical: "/profile" },
  robots: { index: true, follow: true },
  keywords: [
    "清水健利",
    "Taketoshi Shimizu",
    "最高裁判所",
    "司法DX",
    "内閣官房",
    "行政改革",
    "デジタルアドバイザー",
    "RSシステム",
    "Public Deep Infrastructure",
    "AQUA",
    "AQUA studio",
  ],
  openGraph: {
    url: "/profile",
    title: "清水健利 — 最高裁PM / 内閣官房デジタルアドバイザー",
    description:
      "止めてはならない国家インフラへ、最先端クラウドと生成AIを統合する。最高裁・内閣官房での実務と AQUA studio。",
  },
};

const roles = [
  {
    index: "01",
    orgEn: "Supreme Court of Japan",
    orgJa: "最高裁判所",
    role: "事務総局 デジタル総合政策室 司法DX推進プロジェクトマネージャー",
    mission:
      "日本の司法インフラにおける民事裁判手続きのIT化、それに伴うクラウド基盤の環境構築および生成AIを活用した証拠・争点整理の自動化・効率化実証を推進。",
    stack: "Azure / Enterprise AI Governance / Secure Cloud Environment",
    impact: "本格検証に向けたクラウド環境整備および予算スキームの構築、AI利用による業務改善。",
    accent: "#7dd3fc",
  },
  {
    index: "02",
    orgEn: "Cabinet Secretariat",
    orgJa: "内閣官房",
    role: "行政改革・効率化推進事務局 デジタルアドバイザー",
    mission:
      "国の予算執行を一元管理する「RSシステム（行政事業レビューシートシステム）」の次世代刷新。15府省庁が参加するAI実証実験のアーキテクチャ設計と実証評価。",
    stack: "AWS / Azure / Generative AI / Public Sector Data Standardization / Next-gen RS-System",
    impact:
      "次期RSシステム実装に向けた、アウトカム(KPI)のAI自動評価および改善提案アルゴリズムの検証。",
    accent: "#5eead4",
  },
  {
    index: "03",
    orgEn: "Tech Evangelism & Community",
    orgJa: "技術発信・コミュニティ",
    role: "Private WORK / Tech Conference — Personal Software Developer in AQUA Studio",
    mission:
      "エンタープライズ・パブリックセクターにおける大規模クラウド移行戦略。ミッションクリティカルな国家インフラにアジャイルとアジリティを組み込む手法。未来を見据えたシステムの形、重要なシステムに対してAIを活用した品質確保。",
    stack: "AWS / Azure / Agile for Critical Systems / AI-assisted Quality",
    impact: "現場の実装知見を公開実験（AQUA）とカンファレンス発信へ還元。",
    accent: "#fcd34d",
  },
] as const;

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Person",
  name: "清水健利",
  alternateName: ["Taketoshi Shimizu", "Taketoshi.Shimizu", "AQUA"],
  url: "https://www.aquacore.net/profile",
  jobTitle: [
    "最高裁判所 事務総局 デジタル総合政策室 司法DX推進プロジェクトマネージャー",
    "内閣官房 行政改革・効率化推進事務局 デジタルアドバイザー",
  ],
  worksFor: [
    {
      "@type": "GovernmentOrganization",
      name: "最高裁判所",
      alternateName: "Supreme Court of Japan",
    },
    {
      "@type": "GovernmentOrganization",
      name: "内閣官房",
      alternateName: "Cabinet Secretariat",
    },
  ],
  knowsAbout: [
    "司法DX",
    "Public Deep Infrastructure",
    "Azure",
    "Generative AI",
    "行政事業レビューシートシステム",
    "Enterprise AI Governance",
  ],
  description:
    "SIer・外資コンサルを経て国家公務員として公的基盤を構築。止めてはならないレガシー巨大基盤への最先端クラウド統合を担う。",
};

export default function ProfilePage() {
  return (
    <HomePageShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <main>
        <section className="relative min-h-[88vh] overflow-hidden">
          <div
            className="pointer-events-none absolute inset-0 opacity-70"
            aria-hidden
            style={{
              background:
                "radial-gradient(ellipse 80% 55% at 12% 18%, rgba(34,211,238,0.22), transparent 55%), radial-gradient(ellipse 70% 50% at 88% 72%, rgba(45,212,191,0.14), transparent 50%), linear-gradient(180deg, rgba(8,18,36,0.2) 0%, rgba(8,18,36,0.85) 100%)",
            }}
          />
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.07]"
            aria-hidden
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.09) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.09) 1px, transparent 1px)",
              backgroundSize: "72px 72px",
              maskImage: "linear-gradient(180deg, black 20%, transparent 90%)",
            }}
          />

          <div className="relative mx-auto flex min-h-[88vh] w-full max-w-5xl flex-col justify-end px-4 pb-16 pt-24 sm:px-6 sm:pb-20 sm:pt-28">
            <Reveal eager>
              <p className="eyebrow flex items-center gap-3">
                <span className="home-pulse-dot h-1.5 w-1.5 rounded-full bg-cyan-300" />
                Profile · AQUA studio
              </p>
            </Reveal>

            <h1 className="display-hero mt-7 text-white">
              <Reveal eager>
                <span className="block hero-ink-gradient">Taketoshi Shimizu</span>
              </Reveal>
              <Reveal eager>
                <span className="mt-2 block text-[0.52em] font-medium tracking-[0.04em] text-cyan-50/90 sm:text-[0.42em]">
                  清水健利
                </span>
              </Reveal>
            </h1>

            <Reveal eager>
              <p className="mt-6 max-w-2xl text-[15px] leading-7 text-slate-300 sm:text-base sm:leading-8">
                内閣官房の行政改革のデジタルアドバイザーであり、最高裁の司法DXを動かすPM。
                止めてはならない国家インフラへ、最先端クラウドと生成AIを統合する——
                世界にとって希少な、公的基盤の実装者です。
              </p>
            </Reveal>

            <Reveal eager>
              <div className="mt-9 flex flex-wrap gap-3">
                <a
                  href="#missions"
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-300/90 to-teal-200/90 px-5 py-2.5 text-sm font-medium text-slate-950 transition hover:from-cyan-200 hover:to-teal-100"
                >
                  公的ミッションを見る
                  <span aria-hidden>→</span>
                </a>
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 rounded-full border border-white/12 px-5 py-2.5 text-sm font-medium text-slate-300 transition hover:border-white/25 hover:bg-white/5"
                >
                  AQUA Home
                </Link>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="border-y border-white/8 bg-black/20">
          <div className="mx-auto grid max-w-5xl gap-6 px-4 py-10 sm:grid-cols-3 sm:px-6 sm:py-12">
            {[
              { k: "Supreme Court", v: "司法DX PM" },
              { k: "Cabinet Secretariat", v: "デジタル・アドバイザー" },
              { k: "Studio", v: "AQUA · Personal Software" },
            ].map((item) => (
              <Reveal key={item.k}>
                <div>
                  <p className="font-display text-[10px] uppercase tracking-[0.22em] text-slate-500">
                    {item.k}
                  </p>
                  <p className="mt-2 font-display text-lg text-cyan-50">{item.v}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6 sm:py-20">
          <Reveal>
            <p className="eyebrow">Origin</p>
            <h2 className="display-section mt-3 text-white">なぜ、この人が希少なのか</h2>
            <p className="mt-5 max-w-3xl text-[15px] leading-8 text-slate-400">
              SIerや外資コンサルを経験したのち、国家公務員として
              <span className="text-cyan-100/90"> Public / Deep Infrastructure（公的基盤）</span>
              を構築している。絶対に止めてはならないレガシーな巨大基盤へ、最先端クラウド技術を統合する——
              企画だけでなく、実装・予算・ガバナンスまでを一気通貫で担える人材は、国内外でも極めて限られる。
            </p>
          </Reveal>
        </section>

        <section id="missions" className="mx-auto w-full max-w-5xl scroll-mt-20 px-4 pb-20 sm:px-6">
          <Reveal>
            <p className="eyebrow">Missions — Public Infrastructure</p>
            <h2 className="display-section mt-3 text-white">三つの現場</h2>
          </Reveal>

          <div className="mt-10 space-y-8">
            {roles.map((role, i) => (
              <Reveal key={role.index} delayMs={i * 60}>
                <article className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] px-5 py-6 sm:px-8 sm:py-8">
                  <div
                    className="pointer-events-none absolute -right-16 top-0 h-40 w-40 rounded-full opacity-30 blur-3xl"
                    style={{ background: role.accent }}
                    aria-hidden
                  />
                  <div className="relative">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="font-mono text-sm text-cyan-200/80">{role.index}</span>
                      <h3 className="font-display text-xl text-white sm:text-2xl">{role.orgEn}</h3>
                      <span className="text-sm text-slate-400">{role.orgJa}</span>
                    </div>
                    <p className="mt-3 text-sm font-medium leading-relaxed text-cyan-50/95 sm:text-[15px]">
                      Role: {role.role}
                    </p>
                    <dl className="mt-5 grid gap-4 sm:grid-cols-1">
                      <div>
                        <dt className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                          Mission
                        </dt>
                        <dd className="mt-1.5 text-sm leading-7 text-slate-300">{role.mission}</dd>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <dt className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                            Stack
                          </dt>
                          <dd className="mt-1.5 font-mono text-xs leading-6 text-teal-100/80 sm:text-[13px]">
                            {role.stack}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                            Impact
                          </dt>
                          <dd className="mt-1.5 text-sm leading-7 text-slate-300">{role.impact}</dd>
                        </div>
                      </div>
                    </dl>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="border-t border-white/8 bg-gradient-to-b from-cyan-950/30 to-transparent">
          <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-20">
            <Reveal>
              <p className="eyebrow">AQUA studio</p>
              <h2 className="display-section mt-3 text-white">実験場としての AQUA</h2>
              <p className="mt-5 max-w-2xl text-[15px] leading-8 text-slate-400">
                公的基盤の現場知見を、個人スタジオのプロダクト実験へ接続する。
                WORKS・AI合議・宇宙分析・社会貢献——止めてはならないシステムの品質思想を、公開コードと体験で証明する。
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/works"
                  className="inline-flex rounded-full border border-cyan-400/30 bg-cyan-500/10 px-5 py-2.5 text-sm text-cyan-50 transition hover:bg-cyan-500/20"
                >
                  WORKS
                </Link>
                <Link
                  href="/sample"
                  className="inline-flex rounded-full border border-white/12 px-5 py-2.5 text-sm text-slate-300 transition hover:border-white/25 hover:bg-white/5"
                >
                  SHOWCASE
                </Link>
              </div>
            </Reveal>
          </div>
        </section>
      </main>
    </HomePageShell>
  );
}
