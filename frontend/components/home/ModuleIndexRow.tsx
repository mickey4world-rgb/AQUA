import Link from "next/link";

export type ModuleIndexEntry = {
  index: string;
  title: string;
  titleJa: string;
  desc: string;
  href: string;
  tag: string;
  accent: string;
};

type ModuleIndexRowProps = ModuleIndexEntry;

export default function ModuleIndexRow({
  index,
  title,
  titleJa,
  desc,
  href,
  tag,
  accent,
}: ModuleIndexRowProps) {
  return (
    <Link
      href={href}
      className="index-row"
      style={{ "--row-accent": accent } as React.CSSProperties}
    >
      <span className="index-row__num w-8 shrink-0 sm:w-12">{index}</span>

      <div className="min-w-0 flex-1">
        <h3 className="index-row__title truncate">{title}</h3>
        <p className="mt-1.5 truncate text-xs text-slate-400 sm:text-sm">
          <span className="text-slate-300">{titleJa}</span>
          <span className="mx-2 text-slate-600">/</span>
          {desc}
        </p>
      </div>

      <span className="hidden shrink-0 text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-500 lg:block">
        {tag}
      </span>

      <span className="index-row__arrow shrink-0" aria-hidden>
        ↗
      </span>
    </Link>
  );
}
