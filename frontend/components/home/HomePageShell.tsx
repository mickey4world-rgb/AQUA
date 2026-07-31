"use client";

import Header from "@/components/Header";

type HomePageShellProps = {
  children: React.ReactNode;
};

export default function HomePageShell({ children }: HomePageShellProps) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#030712] text-slate-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="home-aurora home-aurora-a" />
        <div className="home-aurora home-aurora-b" />
        <div className="home-aurora home-aurora-c" />

        <div className="home-grid absolute inset-0 opacity-30" />

        <div className="home-orbit home-orbit-1" />
        <div className="home-orbit home-orbit-2" />
        <div className="home-orbit home-orbit-3" />

        <div className="home-scanline absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent" />

        <div className="absolute inset-0">
          {Array.from({ length: 24 }).map((_, i) => (
            <span
              key={i}
              className="home-particle absolute rounded-full bg-cyan-300/60"
              style={{
                left: `${(i * 17 + 7) % 100}%`,
                top: `${(i * 23 + 11) % 100}%`,
                animationDelay: `${(i % 8) * 0.7}s`,
                animationDuration: `${4 + (i % 5)}s`,
              }}
            />
          ))}
        </div>

        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(125,211,252,0.9) 1px, transparent 0)",
            backgroundSize: "32px 32px",
          }}
        />
      </div>

      <div className="relative z-10">
        <Header variant="portal" />
        {children}
      </div>
    </div>
  );
}
