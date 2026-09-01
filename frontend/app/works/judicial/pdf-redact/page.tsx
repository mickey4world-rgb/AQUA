import Link from "next/link";
import Reveal from "@/components/layout/Reveal";
import PdfRedactPanel from "@/components/works/judicial/PdfRedactPanel";
import WorksPageShell from "@/components/works/WorksPageShell";
import { PAGE_MAIN_CLASS } from "@/lib/mobile-utils";

export default function JudicialPdfRedactPage() {
  return (
    <WorksPageShell>
      <main className={PAGE_MAIN_CLASS}>
        <Reveal>
          <Link
            href="/works/judicial"
            className="eyebrow inline-flex items-center gap-2 transition hover:text-slate-300"
          >
            ← 司法パネル
          </Link>
          <h1 className="display-section mt-4 text-white">PDF 黒塗り</h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-400">
            PDF 内の企業名・住所・人名などを黒く塗りつぶした版を生成します。黒塗りする語句は自由に編集でき、
            メールアドレスや電話番号などの自動検出にも対応します。処理はブラウザ内で完結します。
            スキャン画像のみの PDF（テキスト情報がないもの）は対象外です。
          </p>
        </Reveal>

        <Reveal delayMs={80}>
          <div className="mt-8">
            <PdfRedactPanel />
          </div>
        </Reveal>
      </main>
    </WorksPageShell>
  );
}
