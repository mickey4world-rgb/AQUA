"use client";

import AppPageShell from "@/components/layout/AppPageShell";

type SolunaPageShellProps = {
  children: React.ReactNode;
};

export default function SolunaPageShell({ children }: SolunaPageShellProps) {
  return <AppPageShell theme="soluna">{children}</AppPageShell>;
}
