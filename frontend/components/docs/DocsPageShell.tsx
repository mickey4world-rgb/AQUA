"use client";

import AppPageShell from "@/components/layout/AppPageShell";

type DocsPageShellProps = {
  children: React.ReactNode;
};

export default function DocsPageShell({ children }: DocsPageShellProps) {
  return <AppPageShell theme="docs">{children}</AppPageShell>;
}
