"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "ホーム", icon: "⌂" },
  { href: "/works", label: "WORKS", icon: "◈" },
  { href: "/stocks", label: "株", icon: "📈" },
  { href: "/disney", label: "TDR", icon: "✨" },
  { href: "/costs", label: "コスト", icon: "⚡" },
  { href: "/settings", label: "設定", icon: "⚙" },
];

export default function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-slate-950/90 backdrop-blur-xl md:hidden">
      <div
        className="mx-auto flex max-w-lg items-stretch justify-around px-2 pt-2"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      >
        {items.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-w-[3.5rem] flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[10px] transition ${
                active
                  ? "bg-cyan-500/15 text-cyan-100"
                  : "text-slate-400 active:bg-white/5"
              }`}
            >
              <span className="text-base leading-none">{item.icon}</span>
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
