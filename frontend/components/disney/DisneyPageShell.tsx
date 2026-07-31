"use client";

import AppPageShell from "@/components/layout/AppPageShell";

type DisneyPageShellProps = {
  children: React.ReactNode;
};

export default function DisneyPageShell({ children }: DisneyPageShellProps) {
  return <AppPageShell theme="disney">{children}</AppPageShell>;
}
