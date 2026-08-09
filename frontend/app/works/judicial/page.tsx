import Link from "next/link";
import Reveal from "@/components/layout/Reveal";
import WorksPageShell from "@/components/works/WorksPageShell";
import { PAGE_MAIN_CLASS } from "@/lib/mobile-utils";

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
            司法領域のアプリケーションは現在工事中です。法令・裁判例・手続まわりのツールを、このパネルに順次追加していきます。
          </p>
        </Reveal>

        <Reveal delayMs={80}>
          <div className="glass-panel mt-10 rounded-3xl p-8 text-center">
            <p className="font-display text-5xl font-light text-violet-200/70">工事中</p>
            <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-slate-400">
              アイデアの種があれば WORKS の相談ボードで壁打ちできます。実装に落ちたらここへ載せます。
            </p>
            <Link
              href="/works/consult"
              className="mt-6 inline-flex rounded-full border border-white/12 px-5 py-2.5 text-sm text-slate-200 transition hover:bg-white/5"
            >
              相談ボードへ
            </Link>
          </div>
        </Reveal>
      </main>
    </WorksPageShell>
  );
}
