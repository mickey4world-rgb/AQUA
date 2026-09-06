"use client";

import dynamic from "next/dynamic";
import AppPageShell from "@/components/layout/AppPageShell";

const HomeAurora = dynamic(() => import("@/components/home/HomeAurora"), {
  ssr: false,
});

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
