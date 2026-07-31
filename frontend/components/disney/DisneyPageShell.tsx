"use client";

import Header from "@/components/Header";

type DisneyPageShellProps = {
  children: React.ReactNode;
};

export default function DisneyPageShell({ children }: DisneyPageShellProps) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#0b1020] text-slate-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-20 top-10 h-80 w-80 rounded-full bg-fuchsia-500/10 blur-3xl" />
        <div className="absolute right-0 top-24 h-96 w-96 rounded-full bg-sky-500/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/4 h-72 w-72 rounded-full bg-violet-500/10 blur-3xl" />
      </div>
      <div className="relative z-10">
        <Header variant="disney" />
        {children}
      </div>
    </div>
  );
}
