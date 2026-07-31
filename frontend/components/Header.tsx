import Link from "next/link";

const navItems = [
  { href: "/", label: "ダッシュボード" },
  { href: "/stocks", label: "米国株" },
  { href: "/disney", label: "ディズニー" },
  { href: "/costs", label: "コスト" },
  { href: "/settings", label: "設定" },
];

export default function Header() {
  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-lg font-semibold text-zinc-900">
          Personal Apps
        </Link>
        <nav className="flex gap-4 text-sm">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-zinc-600 hover:text-zinc-900"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
