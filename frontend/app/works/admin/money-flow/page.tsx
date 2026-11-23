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
          <h1 className="display-section mt-4 text-white">お金の流れ · 公開五鏡</h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-400">
            行政事業レビューの公開データを、誰の事業か→いくら→誰へ→どう選んだ→どこを疑うか、の公開五鏡で読みます。サンキーは水量と着地の図です。
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
