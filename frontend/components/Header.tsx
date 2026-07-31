import Link from "next/link";

const navItems = [
  { href: "/", label: "ダッシュボード" },
  { href: "/stocks", label: "保有株" },
  { href: "/disney", label: "ディズニー" },
  { href: "/costs", label: "コスト" },
  { href: "/settings", label: "設定" },
];

type HeaderProps = {
  variant?: "default" | "global" | "disney" | "portal" | "costs";
};

export default function Header({ variant = "default" }: HeaderProps) {
  const isGlobal = variant === "global";
  const isDisney = variant === "disney";
  const isPortal = variant === "portal";
  const isCosts = variant === "costs";
  const isThemed = isGlobal || isDisney || isPortal || isCosts;

  const activeHref = isDisney
    ? "/disney"
    : isPortal
      ? "/"
      : isCosts
        ? "/costs"
        : isGlobal
          ? "/stocks"
          : null;

  const activeClass = isDisney
    ? "font-medium text-fuchsia-300"
    : isPortal
      ? "font-medium text-emerald-300"
      : isCosts
        ? "font-medium text-amber-300"
        : "font-medium text-cyan-300";

  return (
    <header
      className={
        isThemed
          ? "border-b border-white/10 bg-slate-950/70 backdrop-blur-xl"
          : "border-b border-zinc-200 bg-white"
      }
    >
      <div
        className={`mx-auto flex items-center justify-between px-6 py-4 ${
          isThemed ? "max-w-6xl" : "max-w-5xl"
        }`}
      >
        <Link
          href="/"
          className={`text-lg font-semibold ${
            isGlobal
              ? "bg-gradient-to-r from-cyan-300 to-violet-300 bg-clip-text text-transparent"
              : isDisney
                ? "bg-gradient-to-r from-fuchsia-300 to-sky-300 bg-clip-text text-transparent"
                : isPortal
                  ? "bg-gradient-to-r from-emerald-300 via-cyan-300 to-violet-300 bg-clip-text text-transparent"
                  : isCosts
                    ? "bg-gradient-to-r from-amber-300 to-orange-300 bg-clip-text text-transparent"
                    : "text-zinc-900"
          }`}
        >
          Personal Apps
        </Link>
        <nav className="flex gap-4 text-sm">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={
                isThemed
                  ? item.href === activeHref
                    ? activeClass
                    : "text-slate-400 transition hover:text-slate-100"
                  : "text-zinc-600 hover:text-zinc-900"
              }
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
