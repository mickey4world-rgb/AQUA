import Link from "next/link";
import Reveal from "@/components/layout/Reveal";
import WorksPageShell from "@/components/works/WorksPageShell";
import { PAGE_MAIN_CLASS } from "@/lib/mobile-utils";

const apps = [
  {
    title: "Case Notebook",
    titleJa: "訴訟記録ノート",
    desc: "訴状・答弁書・書証などを選び、Gemini で争点・時系列・証拠対応を整理する NotebookLM 風の学習ツール。",
    href: "/works/judicial/case-notebook",
    accent: "#c4b5fd",
    ready: true,
  },
];

export default function WorksJudicialPage() {
  return (
    <WorksPageShell>
      <main className={PAGE_MAIN_CLASS}>
        <Reveal>
          <Link
            href="/works"
            className="eyebrow inline-flex items-center gap-2 transition hover:text-slate-300"
          >
            ← Works
          </Link>
          <h1 className="display-section mt-4 text-white">司法パネル</h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-400">
            法令・裁判例・手続まわりのツールを集める場所です。まずは訴訟記録の整理から。
          </p>
        </Reveal>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {apps.map((app, index) => (
            <Reveal key={app.href} delayMs={index * 80}>
              <Link
                href={app.href}
                className="glass-panel hover-lift group relative block overflow-hidden rounded-3xl p-6"
              >
                <div
                  className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full opacity-20 blur-3xl transition group-hover:opacity-40"
                  style={{ background: app.accent }}
                />
                <div className="relative">
                  <p className="font-mono text-[11px] tracking-[0.18em] text-slate-500">
                    {String(index + 1).padStart(2, "0")}
                  </p>
                  <h2 className="mt-4 text-xl font-medium text-white">{app.title}</h2>
                  <p className="mt-1 text-sm text-slate-300">{app.titleJa}</p>
                  <p className="mt-3 text-sm leading-relaxed text-slate-400">
                    {app.desc}
                  </p>
                  <p className="mt-5 text-xs text-slate-500">
                    {app.ready ? "利用可 →" : "工事中"}
                  </p>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </main>
    </WorksPageShell>
  );
}
