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
    desc: "Gemini 相談ボード & 資料生成スタジオ",
    href: "/works",
    tag: "Studio",
    accent: "#34d399",
  },
  {
    index: "02",
    title: "Stocks",
    titleJa: "保有株",
    desc: "米国株・日本株のウォッチと AI 売買アドバイス",
    href: "/stocks",
    tag: "Finance",
    accent: "#22d3ee",
  },
  {
    index: "03",
    title: "Disney",
    titleJa: "ディズニー",
    desc: "TDR 混雑予測・待ち時間・キャラクターチャット",
    href: "/disney",
    tag: "Experience",
    accent: "#e879f9",
  },
  {
    index: "04",
    title: "Council",
    titleJa: "AI 合議",
    desc: "複数 AI が議論し、合意した結論を返す",
    href: "/council",
    tag: "Multi-AI",
    accent: "#a78bfa",
  },
  {
    index: "05",
    title: "Space",
    titleJa: "宇宙分析",
    desc: "望遠鏡タイムライン・小惑星シミュレータ・鷹の目",
    href: "/space",
    tag: "Cosmos",
    accent: "#818cf8",
  },
  {
    index: "06",
    title: "Costs",
    titleJa: "コスト",
    desc: "トークン・API・Azure 実績コストの可視化",
    href: "/costs",
    tag: "Analytics",
    accent: "#fbbf24",
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
        <section className="mx-auto w-full max-w-6xl px-4 pb-16 pt-14 sm:px-6 sm:pb-24 sm:pt-24">
          <Reveal>
            <p className="eyebrow flex items-center gap-3">
              <span className="home-pulse-dot h-1.5 w-1.5 rounded-full bg-cyan-300" />
              AQUA — Personal Software Studio
            </p>
          </Reveal>

          <h1 className="display-hero mt-7">
            <Reveal delayMs={60}>
              <span className="block ink-gradient">Building</span>
            </Reveal>
            <Reveal delayMs={150}>
              <span className="block ink-outline">Personal</span>
            </Reveal>
            <Reveal delayMs={240}>
              <span className="block ink-gradient">Interfaces.</span>
            </Reveal>
          </h1>

          <Reveal delayMs={330}>
            <p className="mt-9 max-w-xl text-base leading-relaxed text-slate-400">
              保有株の監視、ディズニーの混雑分析、複数 AI 合議、宇宙観測、そして
              WORKS。日々の意思決定に必要な情報とツールを、ひとつの静かな画面にまとめました。
            </p>
          </Reveal>

          <Reveal delayMs={400}>
            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Link
                href="/works"
                className="group inline-flex items-center gap-2.5 rounded-full bg-gradient-to-r from-emerald-400 to-teal-300 px-6 py-3 text-sm font-semibold text-emerald-950 transition hover:from-emerald-300 hover:to-teal-200"
              >
                WORKS を見る
                <span className="transition group-hover:translate-x-1">→</span>
              </Link>
              <a
                href="#index"
                className="inline-flex items-center gap-2.5 rounded-full border border-white/15 px-6 py-3 text-sm font-medium text-slate-200 transition hover:border-white/35 hover:bg-white/5"
              >
                全モジュール
              </a>
            </div>
          </Reveal>

          <Reveal delayMs={470}>
            <div className="mt-16 flex items-center gap-5">
              <span className="scroll-cue" aria-hidden />
              <span className="eyebrow">Scroll</span>
            </div>
          </Reveal>
        </section>

        <Reveal>
          <Marquee items={marqueeItems} />
        </Reveal>

        <section id="index" className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 sm:py-24">
          <Reveal>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="eyebrow">Index — 06 Modules</p>
                <h2 className="display-section mt-3 text-white">Selected Works</h2>
              </div>
              <p className="max-w-sm text-sm leading-relaxed text-slate-500">
                各モジュールは独立したテーマカラーと動作を持ちます。行を選ぶとそのまま起動します。
              </p>
            </div>
          </Reveal>

          <Reveal delayMs={80}>
            <div className="index-list mt-10">
              {modules.map((entry) => (
                <ModuleIndexRow key={entry.href} {...entry} />
              ))}
            </div>
          </Reveal>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6 sm:pb-24">
          <Reveal>
            <p className="eyebrow">Approach</p>
          </Reveal>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {capabilities.map((item, i) => (
              <Reveal key={item.label} delayMs={i * 90}>
                <article className="glass-panel hover-lift h-full rounded-2xl p-6">
                  <p className="font-display text-[10px] font-semibold uppercase tracking-[0.3em] text-cyan-300/70">
                    {item.label}
                  </p>
                  <h3 className="mt-4 text-lg font-semibold text-white">{item.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-slate-400">{item.body}</p>
                </article>
              </Reveal>
            ))}
          </div>

          <Reveal delayMs={120}>
            <dl className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
              {stats.map((stat) => (
                <div key={stat.label} className="glass-panel rounded-2xl px-5 py-4">
                  <dt className="font-display text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                    {stat.label}
                  </dt>
                  <dd className="mt-2 font-mono text-sm text-cyan-100">{stat.value}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6 sm:pb-28">
          <Reveal>
            <div className="grid gap-8 border-t border-white/10 pt-10 lg:grid-cols-[1fr_auto]">
              <div>
                <p className="eyebrow">Access Control</p>
                <h2 className="mt-3 text-xl font-semibold text-white">認証ステータス</h2>
                <p className="mt-2 max-w-md text-sm text-slate-500">
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
