"use client";

import AppPageShell from "@/components/layout/AppPageShell";
import HomeAurora from "@/components/home/HomeAurora";

type HomePageShellProps = {
  children: React.ReactNode;
};

export default function HomePageShell({ children }: HomePageShellProps) {
  return (
    <AppPageShell theme="portal">
      <HomeAurora />
      {children}
    </AppPageShell>
  );
}
