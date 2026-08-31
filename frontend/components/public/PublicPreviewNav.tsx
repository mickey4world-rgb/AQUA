import Link from "next/link";

type PublicPreviewNavProps = {
  /** Showcase 内の該当セクション（例: sankey / disney） */
  showcaseAnchor?: string;
};

export default function PublicPreviewNav({ showcaseAnchor }: PublicPreviewNavProps) {
  const showcaseHref = showcaseAnchor ? `/sample#${showcaseAnchor}` : "/sample";

  return (
    <nav
      aria-label="プレビューナビゲーション"
      className="mb-6 flex flex-wrap items-center gap-2 border-b border-white/8 pb-4 text-sm"
    >
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 rounded-full border border-white/12 px-3.5 py-1.5 text-slate-200 transition hover:border-white/25 hover:bg-white/5"
      >
        Home
      </Link>
      <Link
        href={showcaseHref}
        className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/25 bg-cyan-500/10 px-3.5 py-1.5 text-cyan-100 transition hover:bg-cyan-500/20"
      >
        SHOWCASE
      </Link>
    </nav>
  );
}
