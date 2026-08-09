import Link from "next/link";
import Reveal from "@/components/layout/Reveal";
import MoneyFlowPanel from "@/components/works/admin/MoneyFlowPanel";
import WorksPageShell from "@/components/works/WorksPageShell";
import { PAGE_MAIN_CLASS } from "@/lib/mobile-utils";

export default function MoneyFlowPage() {
  return (
    <WorksPageShell>
      <main className={PAGE_MAIN_CLASS}>
        <Reveal>
          <Link
            href="/works/admin"
            className="eyebrow inline-flex items-center gap-2 transition hover:text-slate-300"
          >
            ← 行政パネル
          </Link>
          <h1 className="display-section mt-4 text-white">お金の流れ</h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-400">
            行政事業レビューの主要事項データベースをもとに、政府予算がどの府省庁・事業を経て、どの支出先へ流れたかを可視化します。
          </p>
        </Reveal>

        <Reveal delayMs={80}>
          <div className="mt-8">
            <MoneyFlowPanel />
          </div>
        </Reveal>
      </main>
    </WorksPageShell>
  );
}
