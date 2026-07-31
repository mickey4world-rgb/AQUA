import Link from "next/link";

type DashboardCardProps = {
  title: string;
  desc: string;
  href: string;
  icon: string;
  accent: "cyan" | "fuchsia" | "amber";
  tag: string;
};

const accentStyles = {
  cyan: {
    border: "border-cyan-400/20 hover:border-cyan-400/50",
    glow: "from-cyan-500/20 via-sky-500/5 to-transparent",
    icon: "border-cyan-400/30 bg-cyan-500/10 text-cyan-300",
    tag: "text-cyan-300/80",
    arrow: "text-cyan-300",
  },
  fuchsia: {
    border: "border-fuchsia-400/20 hover:border-fuchsia-400/50",
    glow: "from-fuchsia-500/20 via-violet-500/5 to-transparent",
    icon: "border-fuchsia-400/30 bg-fuchsia-500/10 text-fuchsia-300",
    tag: "text-fuchsia-300/80",
    arrow: "text-fuchsia-300",
  },
  amber: {
    border: "border-amber-400/20 hover:border-amber-400/50",
    glow: "from-amber-500/20 via-orange-500/5 to-transparent",
    icon: "border-amber-400/30 bg-amber-500/10 text-amber-300",
    tag: "text-amber-300/80",
    arrow: "text-amber-300",
  },
};

export default function DashboardCard({
  title,
  desc,
  href,
  icon,
  accent,
  tag,
}: DashboardCardProps) {
  const styles = accentStyles[accent];

  return (
    <Link
      href={href}
      className={`group relative overflow-hidden rounded-2xl border bg-white/[0.03] p-6 backdrop-blur-sm transition duration-300 hover:-translate-y-1 hover:bg-white/[0.06] hover:shadow-[0_0_40px_-12px_rgba(56,189,248,0.35)] ${styles.border}`}
    >
      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br opacity-0 transition group-hover:opacity-100 ${styles.glow}`}
      />
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-xl border text-xl ${styles.icon}`}
          >
            {icon}
          </div>
          <span className={`text-[10px] font-semibold uppercase tracking-[0.2em] ${styles.tag}`}>
            {tag}
          </span>
        </div>
        <h3 className="mt-5 text-lg font-semibold text-white">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">{desc}</p>
        <p className={`mt-4 text-sm font-medium transition group-hover:translate-x-1 ${styles.arrow}`}>
          モジュールを開く →
        </p>
      </div>
    </Link>
  );
}
