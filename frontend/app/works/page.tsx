import Link from "next/link";
import Reveal from "@/components/layout/Reveal";
import WorksPageShell from "@/components/works/WorksPageShell";
import { PAGE_MAIN_CLASS } from "@/lib/mobile-utils";

const entries = [
  {
    index: "01",
    title: "Consult",
    titleJa: "AI 相談ボード",
    desc: "Gemini の無料枠で IT・AI・Claude Code の実装相談。結論をメモに保存して後で実践できます。",
    href: "/works/consult",
    accent: "#34d399",
    points: ["Gemini 無料枠", "テーマ別プロンプト", "まとめ保存 / Markdown 出力"],
  },
  {
    index: "02",
    title: "Docs",
    titleJa: "資料生成スタジオ",
    desc: "チャットで指示すると、内部提案向けの PowerPoint（約5枚）を Azure OpenAI が自動生成します。",
    href: "/works/docs",
    accent: "#38bdf8",
    points: ["pptx 自動生成", "参考資料の添付", "スライドプレビュー"],
  },
];

export default function WorksPage() {
  return (
    <WorksPageShell>
      <main className={PAGE_MAIN_CLASS}>
        <Reveal>
          <p className="eyebrow">Works — Build & Consult</p>
          <h1 className="display-section mt-4 text-white">
            Workspace<span className="text-emerald-400">.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-relaxed text-slate-400 sm:text-base">
            作るための場所です。AI に相談して方針を固め、その結論を Claude Code
            にそのまま渡せる形で保存し、必要なら資料まで生成する — 一連の流れをここに集約しました。
          </p>
        </Reveal>

        <div className="mt-12 grid gap-5 lg:grid-cols-2">
          {entries.map((entry, i) => (
            <Reveal key={entry.href} delayMs={i * 100}>
              <Link
                href={entry.href}
                className="glass-panel hover-lift group relative flex h-full flex-col overflow-hidden rounded-3xl p-7"
              >
                <div
                  className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-25 blur-3xl transition duration-500 group-hover:opacity-45"
                  style={{ background: entry.accent }}
                />

                <div className="relative flex items-start justify-between gap-4">
                  <span className="font-mono text-[11px] tracking-[0.2em] text-slate-500">
                    {entry.index}
                  </span>
                  <span
                    className="text-xl transition duration-500 group-hover:translate-x-1 group-hover:-translate-y-1"
                    style={{ color: entry.accent }}
                    aria-hidden
                  >
                    ↗
                  </span>
                </div>

                <h2
                  className="font-display relative mt-6 text-4xl font-bold uppercase tracking-tight text-white sm:text-5xl"
                >
                  {entry.title}
                </h2>
                <p className="relative mt-2 text-sm font-medium text-slate-300">
                  {entry.titleJa}
                </p>
                <p className="relative mt-4 flex-1 text-sm leading-relaxed text-slate-400">
                  {entry.desc}
                </p>

                <ul className="relative mt-6 flex flex-wrap gap-2">
                  {entry.points.map((point) => (
                    <li
                      key={point}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-slate-300"
                    >
                      {point}
                    </li>
                  ))}
                </ul>
              </Link>
            </Reveal>
          ))}
        </div>

        <Reveal delayMs={140}>
          <section className="mt-14 border-t border-white/10 pt-8">
            <p className="eyebrow">Flow</p>
            <ol className="mt-6 grid gap-4 md:grid-cols-3">
              {[
                {
                  step: "1",
                  title: "相談する",
                  body: "テーマを選んで Gemini に相談。トレードオフ付きで方針が返ります。",
                },
                {
                  step: "2",
                  title: "まとめて保存",
                  body: "会話から実装ステップと Claude Code 用プロンプトを自動生成して保存。",
                },
                {
                  step: "3",
                  title: "実装する",
                  body: "保存したプロンプトをコピーして Claude Code に貼るだけで着手できます。",
                },
              ].map((item) => (
                <li key={item.step} className="glass-panel rounded-2xl p-5">
                  <span className="font-display text-3xl font-bold text-emerald-400/80">
                    {item.step}
                  </span>
                  <h3 className="mt-3 text-sm font-semibold text-white">{item.title}</h3>
                  <p className="mt-2 text-xs leading-relaxed text-slate-400">{item.body}</p>
                </li>
              ))}
            </ol>
          </section>
        </Reveal>
      </main>
    </WorksPageShell>
  );
}
