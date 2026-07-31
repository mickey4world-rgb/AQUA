"use client";

import AppPageShell from "@/components/layout/AppPageShell";

type CostsPageShellProps = {
  children: React.ReactNode;
};

export default function CostsPageShell({ children }: CostsPageShellProps) {
  return <AppPageShell theme="costs">{children}</AppPageShell>;
}
