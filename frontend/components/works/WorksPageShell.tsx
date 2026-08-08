"use client";

import AppPageShell from "@/components/layout/AppPageShell";

type WorksPageShellProps = {
  children: React.ReactNode;
};

export default function WorksPageShell({ children }: WorksPageShellProps) {
  return <AppPageShell theme="works">{children}</AppPageShell>;
}
