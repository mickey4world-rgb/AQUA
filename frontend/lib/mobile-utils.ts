"use client";

import { useSyncExternalStore } from "react";

export type MobileProfile = {
  isMobile: boolean;
  saveData: boolean;
  reducedMotion: boolean;
  liteMode: boolean;
};

const DEFAULT_PROFILE: MobileProfile = {
  isMobile: false,
  saveData: false,
  reducedMotion: false,
  liteMode: false,
};

type Connection = {
  saveData?: boolean;
  effectiveType?: string;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
};

function getConnection(): Connection | undefined {
  return (navigator as Navigator & { connection?: Connection }).connection;
}

/**
 * useSyncExternalStore は値が変わっていない限り同じ参照が返ることを前提にしているため、
 * 直近のスナップショットを保持して差分があるときだけ作り直す。
 */
let snapshot: MobileProfile = DEFAULT_PROFILE;

function getSnapshot(): MobileProfile {
  const connection = getConnection();
  const isMobile = window.matchMedia("(max-width: 768px)").matches;
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const saveData =
    connection?.saveData === true ||
    connection?.effectiveType === "slow-2g" ||
    connection?.effectiveType === "2g";
  const liteMode = isMobile || saveData || reducedMotion;

  if (
    snapshot.isMobile === isMobile &&
    snapshot.saveData === saveData &&
    snapshot.reducedMotion === reducedMotion &&
    snapshot.liteMode === liteMode
  ) {
    return snapshot;
  }

  snapshot = { isMobile, saveData, reducedMotion, liteMode };
  return snapshot;
}

function getServerSnapshot(): MobileProfile {
  return DEFAULT_PROFILE;
}

function subscribe(onChange: () => void): () => void {
  const mobileMq = window.matchMedia("(max-width: 768px)");
  const motionMq = window.matchMedia("(prefers-reduced-motion: reduce)");
  const connection = getConnection();

  mobileMq.addEventListener("change", onChange);
  motionMq.addEventListener("change", onChange);
  connection?.addEventListener?.("change", onChange);

  return () => {
    mobileMq.removeEventListener("change", onChange);
    motionMq.removeEventListener("change", onChange);
    connection?.removeEventListener?.("change", onChange);
  };
}

export function useMobileProfile(): MobileProfile {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function getAdaptiveRefreshMs(
  baseMs: number,
  profile: Pick<MobileProfile, "isMobile" | "saveData">,
): number {
  if (profile.saveData) return baseMs * 4;
  if (profile.isMobile) return baseMs * 2;
  return baseMs;
}

export const PAGE_MAIN_CLASS =
  "mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10";
