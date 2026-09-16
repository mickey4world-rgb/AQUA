"use client";

import AppPageShell from "@/components/layout/AppPageShell";

export default function TravelPageShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppPageShell theme="travel">{children}</AppPageShell>;
}
