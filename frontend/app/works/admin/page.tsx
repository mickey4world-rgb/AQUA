import Link from "next/link";
import Reveal from "@/components/layout/Reveal";
import WorksPageShell from "@/components/works/WorksPageShell";
import { PAGE_MAIN_CLASS } from "@/lib/mobile-utils";

const apps = [
  {
    title: "Money Flow",
    titleJa: "お金の流れ",
    desc: "行政事業レビューの支出先データをサンキー図で可視化。政府全体から府省庁、企業名まで絞り込めます。",
    href: "/works/admin/money-flow",
    accent: "#67e8f9",
    ready: true,
  },
  {
    title: "Future apps",
    titleJa: "今後のアプリ",
    desc: "見える化サイトやハッカソン受賞アイデア（ZAIMYAKU など）を参考に、行政パネルへ順次追加します。",
    accent: "#38bdf8",
    ready: false,
  },
];

export default function WorksAdminPage() {
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
          <h1 className="display-section mt-4 text-white">行政パネル</h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-400">
            公開データを手がかりに、行政の支出や事業を読み解くアプリを集める場所です。まずはお金の流れから。
          </p>
        </Reveal>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {apps.map((app, index) => {
            const content = (
              <>
                <p className="font-mono text-[11px] tracking-[0.18em] text-slate-500">
                  {String(index + 1).padStart(2, "0")}
                </p>
                <h2 className="mt-4 text-xl font-medium text-white">{app.title}</h2>
                <p className="mt-1 text-sm text-slate-300">{app.titleJa}</p>
                <p className="mt-3 text-sm leading-relaxed text-slate-400">{app.desc}</p>
                <p className="mt-5 text-xs text-slate-500">
                  {app.ready ? "利用可 →" : "工事中"}
                </p>
              </>
            );

            if (!app.ready || !("href" in app) || !app.href) {
              return (
                <div
                  key={app.title}
                  className="glass-panel rounded-3xl p-6 opacity-75"
                >
                  {content}
                </div>
              );
            }

            return (
              <Reveal key={app.href} delayMs={index * 80}>
                <Link
                  href={app.href}
                  className="glass-panel hover-lift group relative block overflow-hidden rounded-3xl p-6"
                >
                  <div
                    className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full opacity-20 blur-3xl transition group-hover:opacity-40"
                    style={{ background: app.accent }}
                  />
                  <div className="relative">{content}</div>
                </Link>
              </Reveal>
            );
          })}
        </div>
      </main>
    </WorksPageShell>
  );
}
