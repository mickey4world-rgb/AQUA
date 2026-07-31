import Link from "next/link";

const navItems = [
  { href: "/", label: "ダッシュボード" },
  { href: "/stocks", label: "保有株" },
  { href: "/disney", label: "ディズニー" },
  { href: "/costs", label: "コスト" },
  { href: "/settings", label: "設定" },
];

type HeaderProps = {
  variant?: "default" | "global";
};

export default function Header({ variant = "default" }: HeaderProps) {
  const isGlobal = variant === "global";

  return (
    <header
      className={
        isGlobal
          ? "border-b border-white/10 bg-slate-950/70 backdrop-blur-xl"
          : "border-b border-zinc-200 bg-white"
      }
    >
      <div
        className={`mx-auto flex items-center justify-between px-6 py-4 ${
          isGlobal ? "max-w-6xl" : "max-w-5xl"
        }`}
      >
        <Link
          href="/"
          className={`text-lg font-semibold ${
            isGlobal
              ? "bg-gradient-to-r from-cyan-300 to-violet-300 bg-clip-text text-transparent"
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
                isGlobal
                  ? item.href === "/stocks"
                    ? "font-medium text-cyan-300"
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
