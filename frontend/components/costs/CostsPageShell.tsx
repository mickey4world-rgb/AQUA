"use client";

import Header from "@/components/Header";

type CostsPageShellProps = {
  children: React.ReactNode;
};

export default function CostsPageShell({ children }: CostsPageShellProps) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0a0a0f] text-slate-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-20 top-0 h-96 w-96 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="absolute right-0 top-24 h-[28rem] w-[28rem] rounded-full bg-orange-600/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-rose-500/10 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(251,191,36,0.8) 1px, transparent 0)",
            backgroundSize: "24px 24px",
          }}
        />
      </div>
      <div className="relative z-10">
        <Header variant="costs" />
        {children}
      </div>
    </div>
  );
}
