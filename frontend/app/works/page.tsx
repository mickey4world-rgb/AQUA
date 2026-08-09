import Link from "next/link";
import Reveal from "@/components/layout/Reveal";
import WorksPageShell from "@/components/works/WorksPageShell";
import { PAGE_MAIN_CLASS } from "@/lib/mobile-utils";

type AppCard = {
  title: string;
  titleJa: string;
  desc: string;
  href?: string;
  status?: "ready" | "soon";
  points: string[];
  accent: string;
};

type Panel = {
  index: string;
  label: string;
  labelJa: string;
  description: string;
  accent: string;
  apps: AppCard[];
};

const panels: Panel[] = [
  {
    index: "01",
    label: "Consult",
    labelJa: "AI 相談",
    description: "Gemini の無料枠で IT・AI・Claude Code の実装方針を相談し、結論をメモに残せます。",
    accent: "#5eead4",
    apps: [
      {
        title: "Gemini Consult",
        titleJa: "AI 相談ボード",
        desc: "テーマ別プロンプトで相談し、まとめを Markdown で保存。",
        href: "/works/consult",
        status: "ready",
        points: ["Gemini 無料枠", "まとめ保存", "Claude Code 用プロンプト"],
        accent: "#5eead4",
      },
    ],
  },
  {
    index: "02",
    label: "Judicial",
    labelJa: "司法",
    description: "裁判例・法令・手続まわりのツール群をここに集約予定です。",
    accent: "#c4b5fd",
    apps: [
      {
        title: "Coming soon",
        titleJa: "工事中",
        desc: "司法領域のアプリケーションは準備中です。ハッカソンのアイデアも参考にしながら拡充します。",
        href: "/works/judicial",
        status: "soon",
        points: ["工事中", "今後追加"],
        accent: "#c4b5fd",
      },
    ],
  },
  {
    index: "03",
    label: "Administration",
    labelJa: "行政",
    description: "行政事業レビューなど、公開データを手がかりにする行政系アプリを並べていきます。",
    accent: "#67e8f9",
    apps: [
      {
        title: "Money Flow",
        titleJa: "お金の流れ",
        desc: "行政事業レビューの支出先データをサンキー図で可視化。企業名や府省庁で絞り込めます。",
        href: "/works/admin/money-flow",
        status: "ready",
        points: ["サンキー図", "府省庁フィルタ", "企業名検索"],
        accent: "#67e8f9",
      },
      {
        title: "More apps",
        titleJa: "今後追加",
        desc: "見える化サイトやハッカソン受賞アイデアを参考に、行政パネルへ順次追加します。",
        status: "soon",
        points: ["工事中", "ハッカソン参考"],
        accent: "#38bdf8",
      },
    ],
  },
  {
    index: "04",
    label: "Misc",
    labelJa: "その他",
    description: "資料作成など、分野を問わないユーティリティをまとめます。",
    accent: "#fcd34d",
    apps: [
      {
        title: "Docs",
        titleJa: "資料生成スタジオ",
        desc: "チャットで指示すると、内部提案向けの PowerPoint（約5枚）を自動生成します。",
        href: "/works/misc/docs",
        status: "ready",
        points: ["pptx 自動生成", "参考資料添付", "スライドプレビュー"],
        accent: "#fcd34d",
      },
    ],
  },
];

export default function WorksPage() {
  return (
    <WorksPageShell>
      <main className={PAGE_MAIN_CLASS}>
        <Reveal>
          <p className="eyebrow">Works — Studio</p>
          <h1 className="display-section mt-4 text-white">
            相談し、調べ、つくる場所
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-relaxed text-slate-400 sm:text-[15px]">
            トップは Gemini 相談。その下に司法・行政・その他のパネルを置き、今後のアプリを同じ場所へ積み重ねていきます。
          </p>
        </Reveal>

        <div className="mt-12 space-y-8">
          {panels.map((panel, panelIndex) => (
            <Reveal key={panel.label} delayMs={panelIndex * 70}>
              <section className="glass-panel rounded-[1.75rem] p-5 sm:p-7">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-[11px] tracking-[0.18em] text-slate-500">
                        {panel.index}
                      </span>
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: panel.accent }}
                      />
                      <p className="eyebrow" style={{ color: panel.accent }}>
                        {panel.label}
                      </p>
                    </div>
                    <h2 className="display-sub mt-3 text-white">{panel.labelJa}</h2>
                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
                      {panel.description}
                    </p>
                  </div>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  {panel.apps.map((app) => {
                    const body = (
                      <>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="text-lg font-medium text-white">{app.title}</h3>
                            <p className="mt-1 text-sm text-slate-300">{app.titleJa}</p>
                          </div>
                          <StatusPill status={app.status ?? "ready"} />
                        </div>
                        <p className="mt-3 flex-1 text-sm leading-relaxed text-slate-400">
                          {app.desc}
                        </p>
                        <ul className="mt-5 flex flex-wrap gap-2">
                          {app.points.map((point) => (
                            <li
                              key={point}
                              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] text-slate-300"
                            >
                              {point}
                            </li>
                          ))}
                        </ul>
                      </>
                    );

                    if (!app.href) {
                      return (
                        <div
                          key={app.title}
                          className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/8 bg-white/[0.02] p-5 opacity-80"
                        >
                          {body}
                        </div>
                      );
                    }

                    return (
                      <Link
                        key={app.href}
                        href={app.href}
                        className="hover-lift group relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-5"
                      >
                        <div
                          className="pointer-events-none absolute -right-14 -top-14 h-40 w-40 rounded-full opacity-20 blur-3xl transition duration-500 group-hover:opacity-40"
                          style={{ background: app.accent }}
                        />
                        <div className="relative flex h-full flex-col">{body}</div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            </Reveal>
          ))}
        </div>

        <Reveal delayMs={180}>
          <p className="mt-10 text-[11px] leading-relaxed text-slate-600">
            行政パネルは内閣官房の「行政改革学生アイデアソン・ハッカソン Award Day」なども参考に拡充予定です。{" "}
            <a
              href="https://www.gyoukaku.go.jp/review/AI/awardday/index.html#section9"
              target="_blank"
              rel="noreferrer"
              className="underline decoration-white/20 underline-offset-2 hover:text-slate-400"
            >
              参考リンク
            </a>
          </p>
        </Reveal>
      </main>
    </WorksPageShell>
  );
}

function StatusPill({ status }: { status: "ready" | "soon" }) {
  if (status === "soon") {
    return (
      <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2.5 py-1 text-[10px] font-medium tracking-wide text-amber-100">
        工事中
      </span>
    );
  }
  return (
    <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2.5 py-1 text-[10px] font-medium tracking-wide text-emerald-100">
      利用可
    </span>
  );
}
