"use client";

import { stockChartLinksForCode } from "@/lib/stock-chart-links";

type Props = {
  code: string;
  /** アクティブ行は強調 */
  emphasize?: boolean;
  className?: string;
};

/** ローソク足を外部サイトで確認するリンク群 */
export default function StockChartExternalLinks({
  code,
  emphasize = false,
  className = "",
}: Props) {
  const links = stockChartLinksForCode(code);
  if (links.length === 0) {
    return <span className="text-slate-600">—</span>;
  }

  return (
    <span
      className={`inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 ${className}`}
      title="ローソク足チャート（外部）"
    >
      {links.map((link) => (
        <a
          key={link.id}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          className={
            emphasize
              ? "text-[11px] font-medium text-cyan-300 underline-offset-2 hover:text-cyan-200 hover:underline"
              : "text-[11px] text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline"
          }
        >
          {link.label}
        </a>
      ))}
    </span>
  );
}
