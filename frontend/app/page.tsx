import AuthStatus from "@/components/AuthStatus";
import DashboardCard from "@/components/home/DashboardCard";
import HomePageShell from "@/components/home/HomePageShell";
import { PAGE_MAIN_CLASS } from "@/lib/mobile-utils";

const modules = [
  {
    title: "保有株",
    desc: "米国株・日本株のウォッチ、売却見込み、AI 売買アドバイス",
    href: "/stocks",
    icon: "📈",
    accent: "cyan" as const,
    tag: "Finance",
  },
  {
    title: "ディズニー",
    desc: "TDR 混雑状況・待ち時間・ミッキーチャット",
    href: "/disney",
    icon: "✨",
    accent: "fuchsia" as const,
    tag: "Experience",
  },
  {
    title: "AI 合議",
    desc: "複数 AI が議論し、合意した回答をまとめて返す",
    href: "/council",
    icon: "🤝",
    accent: "violet" as const,
    tag: "Multi-AI",
  },
  {
    title: "資料生成",
    desc: "チャットで内部提案 PowerPoint（pptx）を自動生成",
    href: "/docs",
    icon: "📄",
    accent: "blue" as const,
    tag: "Documents",
  },
  {
    title: "コスト",
    desc: "トークン・API・コスト分析ダッシュボード",
    href: "/costs",
    icon: "⚡",
    accent: "amber" as const,
    tag: "Analytics",
  },
];

export default function Home() {
  return (
    <HomePageShell>
      <main className={PAGE_MAIN_CLASS}>
        <section className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-md sm:rounded-3xl sm:p-10">
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-cyan-400/12 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-8 left-1/3 h-32 w-32 rounded-full bg-indigo-500/12 blur-3xl" />
          <div className="pointer-events-none absolute right-1/4 top-1/2 h-24 w-24 rounded-full bg-violet-400/10 blur-2xl" />

          <div className="relative">
            <p className="inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-cyan-200">
              <span className="home-pulse-dot h-1.5 w-1.5 rounded-full bg-cyan-300" />
              AQUA Information
            </p>
            <h1 className="mt-5 text-3xl font-bold tracking-tight text-white sm:text-5xl">
              <span className="bg-gradient-to-r from-cyan-200 via-teal-200 to-indigo-200 bg-clip-text text-transparent">
                AQUA{" "}
              </span>
              <span className="bg-gradient-to-r from-sky-200 via-violet-200 to-fuchsia-200 bg-clip-text text-transparent">
                Information
              </span>
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-400">
              個人向け統合情報ポータル。保有株の監視、ディズニーの混雑分析、
              複数 AI 合議、資料生成、AI 利用コストを AQUA からひとつの画面でアクセスできます。
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {[
                { label: "Modules", value: "5" },
                { label: "Auth", value: "Azure SWA" },
                { label: "AI Engine", value: "GPT-4o" },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-xl border border-white/10 bg-black/20 px-4 py-3"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                    {stat.label}
                  </p>
                  <p className="mt-1 font-mono text-sm text-cyan-100">{stat.value}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-10">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300/70">
                Access Control
              </p>
              <h2 className="mt-1 text-xl font-semibold text-white">認証ステータス</h2>
            </div>
          </div>
          <div className="max-w-xl">
            <AuthStatus variant="dark" />
          </div>
        </section>

        <section className="mt-12">
          <div className="mb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-indigo-300/70">
              Application Modules
            </p>
            <h2 className="mt-1 text-xl font-semibold text-white">アプリケーションモジュール</h2>
            <p className="mt-2 text-sm text-slate-400">
              各モジュールは独立したテーマと機能を持ち、日常利用に最適化されています。
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {modules.map((card) => (
              <DashboardCard key={card.href} {...card} />
            ))}
          </div>
        </section>
      </main>
    </HomePageShell>
  );
}
