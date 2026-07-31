"use client";

import AppPageShell from "@/components/layout/AppPageShell";

type HomePageShellProps = {
  children: React.ReactNode;
};

export default function HomePageShell({ children }: HomePageShellProps) {
  return <AppPageShell theme="portal">{children}</AppPageShell>;
}
