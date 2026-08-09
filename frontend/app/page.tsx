import Link from "next/link";
import HomePageShell from "@/components/home/HomePageShell";
import Marquee from "@/components/home/Marquee";
import ModuleIndexRow, {
  type ModuleIndexEntry,
} from "@/components/home/ModuleIndexRow";
import Reveal from "@/components/layout/Reveal";

const modules: ModuleIndexEntry[] = [
  {
    index: "01",
    title: "Works",
    titleJa: "ワークス",
    desc: "Gemini 相談、行政のお金の流れ、資料作成",
    href: "/works",
    tag: "Studio",
    accent: "#5eead4",
  },
  {
    index: "02",
    title: "Stocks",
    titleJa: "保有株",
    desc: "米国株・日本株のウォッチと AI 売買アドバイス",
    href: "/stocks",
    tag: "Finance",
    accent: "#67e8f9",
  },
  {
    index: "03",
    title: "Disney",
    titleJa: "ディズニー",
    desc: "TDR 混雑予測・待ち時間・キャラクターチャット",
    href: "/disney",
    tag: "Experience",
    accent: "#f0abfc",
  },
  {
    index: "04",
    title: "Council",
    titleJa: "AI 合議",
    desc: "複数 AI が議論し、合意した結論を返す",
    href: "/council",
    tag: "Multi-AI",
    accent: "#c4b5fd",
  },
  {
    index: "05",
    title: "Space",
    titleJa: "宇宙分析",
    desc: "望遠鏡タイムライン・小惑星シミュレータ・鷹の目",
    href: "/space",
    tag: "Cosmos",
    accent: "#a5b4fc",
  },
  {
    index: "06",
    title: "Costs",
    titleJa: "コスト",
    desc: "トークン・API・Azure 実績コストの可視化",
    href: "/costs",
    tag: "Analytics",
    accent: "#fcd34d",
  },
];

const marqueeItems = [
  "Next.js 16",
  "Azure Static Web Apps",
  "Cosmos DB",
  "Azure OpenAI",
  "Gemini",
  "CesiumJS",
  "Three.js",
  "TypeScript",
];

const stats = [
  { label: "Modules", value: "06" },
  { label: "Engines", value: "GPT / Gemini" },
  { label: "Region", value: "Japan East" },
];

export default function Home() {
  return (
    <HomePageShell>
      <main>
        <section className="mx-auto w-full max-w-5xl px-4 pb-14 pt-16 sm:px-6 sm:pb-20 sm:pt-24">
          <Reveal>
            <p className="eyebrow flex items-center gap-3">
              <span className="home-pulse-dot h-1.5 w-1.5 rounded-full bg-cyan-300" />
              AQUA — Personal Software Studio
            </p>
          </Reveal>

          <h1 className="display-hero mt-8 text-white">
            <Reveal delayMs={70}>
              <span className="block ink-gradient">
                AQUA&apos;s Promising Research
              </span>
            </Reveal>
            <Reveal delayMs={160}>
              <span className="block mt-2 ink-soft">
                and Challenges Leveraging AI
              </span>
            </Reveal>
          </h1>

          <Reveal delayMs={260}>
            <p className="mt-8 max-w-lg text-[15px] leading-7 text-slate-400">
              保有株の監視、ディズニーの混雑分析、複数 AI 合議、宇宙観測、そして WORKS。
              光と水のあいだに、必要な情報だけをやさしく並べました。
            </p>
          </Reveal>

          <Reveal delayMs={340}>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                href="/works"
                className="group inline-flex items-center gap-2.5 rounded-full bg-gradient-to-r from-cyan-300/90 to-teal-200/90 px-5 py-2.5 text-sm font-medium text-slate-950 transition hover:from-cyan-200 hover:to-teal-100"
              >
                WORKS を見る
                <span className="transition group-hover:translate-x-0.5">→</span>
              </Link>
              <a
                href="#index"
                className="inline-flex items-center gap-2.5 rounded-full border border-white/12 px-5 py-2.5 text-sm font-medium text-slate-300 transition hover:border-white/25 hover:bg-white/5"
              >
                全モジュール
              </a>
            </div>
          </Reveal>

          <Reveal delayMs={420}>
            <div className="mt-14 flex items-center gap-4">
              <span className="scroll-cue" aria-hidden />
              <span className="eyebrow">Scroll</span>
            </div>
          </Reveal>
        </section>

        <Reveal>
          <Marquee items={marqueeItems} />
        </Reveal>

        <section id="index" className="mx-auto w-full max-w-5xl scroll-mt-20 px-4 py-16 sm:px-6 sm:py-20">
          <Reveal>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="eyebrow">Index — 06 Modules</p>
                <h2 className="display-section mt-3 text-white">選ばれたモジュール</h2>
              </div>
              <p className="max-w-sm text-sm leading-relaxed text-slate-500">
                各モジュールは独立したテーマカラーと動作を持ちます。行を選ぶとそのまま起動します。
              </p>
            </div>
          </Reveal>

          <Reveal delayMs={80}>
            <div className="index-list mt-8">
              {modules.map((entry) => (
                <ModuleIndexRow key={entry.href} {...entry} />
              ))}
            </div>
          </Reveal>

          <Reveal delayMs={120}>
            <dl className="mt-10 grid grid-cols-3 gap-3">
              {stats.map((stat) => (
                <div key={stat.label} className="rounded-xl px-1 py-2">
                  <dt className="font-display text-[10px] font-medium uppercase tracking-[0.22em] text-slate-500">
                    {stat.label}
                  </dt>
                  <dd className="mt-1.5 font-mono text-sm text-cyan-100/80">{stat.value}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </section>
      </main>
    </HomePageShell>
  );
}
