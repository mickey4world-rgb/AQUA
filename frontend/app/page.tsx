import Link from "next/link";
import AuthStatus from "@/components/AuthStatus";
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

const capabilities = [
  {
    label: "Realtime",
    title: "リアルタイム観測",
    body: "衛星軌道・株価・パーク待ち時間を実データで取得し、鮮度の高い状態で提示します。",
  },
  {
    label: "Multi-model",
    title: "複数 AI の使い分け",
    body: "Azure OpenAI と Gemini を用途で切り替え、合議・要約・相談をそれぞれ最適なモデルで実行。",
  },
  {
    label: "Cost aware",
    title: "コストの可視化",
    body: "トークン消費と Azure 実績請求を同じダッシュボードに集約し、使いすぎを未然に防ぎます。",
  },
];

const stats = [
  { label: "Modules", value: "06" },
  { label: "Auth", value: "Azure SWA" },
  { label: "Engines", value: "GPT-4o / Gemini" },
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
              <span className="block">
                <span className="ink-soft">静かな画面に、</span>
              </span>
            </Reveal>
            <Reveal delayMs={160}>
              <span className="block mt-1">
                <span className="ink-gradient">日々の判断の手がかりを。</span>
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
        </section>

        <section className="mx-auto w-full max-w-5xl px-4 pb-16 sm:px-6 sm:pb-20">
          <Reveal>
            <p className="eyebrow">Approach</p>
            <h2 className="display-section mt-3 text-white">大切にしていること</h2>
          </Reveal>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {capabilities.map((item, i) => (
              <Reveal key={item.label} delayMs={i * 90}>
                <article className="glass-panel hover-lift h-full rounded-2xl p-6">
                  <p className="font-display text-[10px] font-medium uppercase tracking-[0.22em] text-cyan-300/70">
                    {item.label}
                  </p>
                  <h3 className="display-sub mt-4 text-white">{item.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-slate-400">{item.body}</p>
                </article>
              </Reveal>
            ))}
          </div>

          <Reveal delayMs={120}>
            <dl className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
              {stats.map((stat) => (
                <div key={stat.label} className="glass-panel rounded-2xl px-5 py-4">
                  <dt className="font-display text-[10px] font-medium uppercase tracking-[0.22em] text-slate-500">
                    {stat.label}
                  </dt>
                  <dd className="mt-2 font-mono text-sm text-cyan-100/90">{stat.value}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </section>

        <section className="mx-auto w-full max-w-5xl px-4 pb-20 sm:px-6 sm:pb-28">
          <Reveal>
            <div className="grid gap-8 border-t border-white/8 pt-10 lg:grid-cols-[1fr_auto]">
              <div>
                <p className="eyebrow">Access Control</p>
                <h2 className="display-section mt-3 text-white">認証ステータス</h2>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-500">
                  Azure Static Web Apps の認証を使用。許可されたアカウントのみが各モジュールへアクセスできます。
                </p>
              </div>
              <div className="w-full lg:w-96">
                <AuthStatus variant="dark" />
              </div>
            </div>
          </Reveal>
        </section>
      </main>
    </HomePageShell>
  );
}
