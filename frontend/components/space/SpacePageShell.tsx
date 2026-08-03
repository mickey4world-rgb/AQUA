"use client";

import AppPageShell from "@/components/layout/AppPageShell";

type SpacePageShellProps = {
  children: React.ReactNode;
};

export default function SpacePageShell({ children }: SpacePageShellProps) {
  return <AppPageShell theme="space">{children}</AppPageShell>;
}
