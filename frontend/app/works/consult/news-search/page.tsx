import Link from "next/link";
import Reveal from "@/components/layout/Reveal";
import NewsSearchPanel from "@/components/works/NewsSearchPanel";
import WorksPageShell from "@/components/works/WorksPageShell";
import { PAGE_MAIN_CLASS } from "@/lib/mobile-utils";

export default function WorksNewsSearchPage() {
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
          <h1 className="display-section mt-4 text-white">ニュースサーチ</h1>
          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-slate-400">
            毎晩、AI・システム開発・世界経済・官公庁の注目ニュースを複数ソースから集約し、深堀・今後の見通し・出典・注目指数付きで整理します。
            解説を選んで AI に相談でき、Soluna のニュース討伐とも連携します。
          </p>
        </Reveal>

        <Reveal delayMs={80}>
          <div className="mt-8">
            <NewsSearchPanel />
          </div>
        </Reveal>
      </main>
    </WorksPageShell>
  );
}
