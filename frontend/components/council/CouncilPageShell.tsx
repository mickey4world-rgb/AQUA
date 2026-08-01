"use client";

import AppPageShell from "@/components/layout/AppPageShell";

type CouncilPageShellProps = {
  children: React.ReactNode;
};

export default function CouncilPageShell({ children }: CouncilPageShellProps) {
  return <AppPageShell theme="council">{children}</AppPageShell>;
}
