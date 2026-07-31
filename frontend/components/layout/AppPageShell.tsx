"use client";

import AnimatedBackground, {
  type BackgroundTheme,
} from "@/components/layout/AnimatedBackground";
import MobileBottomNav from "@/components/layout/MobileBottomNav";
import Header from "@/components/Header";

type AppPageShellProps = {
  theme: BackgroundTheme;
  children: React.ReactNode;
};

export default function AppPageShell({ theme, children }: AppPageShellProps) {
  return (
    <div className={`relative min-h-screen overflow-x-hidden text-slate-100 app-shell-${theme}`}>
      <AnimatedBackground theme={theme} />
      <div className="relative z-10 flex min-h-screen flex-col">
        <Header variant={theme} />
        <div className="flex-1 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">
          {children}
        </div>
        <MobileBottomNav />
      </div>
    </div>
  );
}
