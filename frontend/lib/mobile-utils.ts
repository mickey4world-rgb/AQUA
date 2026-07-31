"use client";

import { useEffect, useState } from "react";

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

export function useMobileProfile(): MobileProfile {
  const [profile, setProfile] = useState<MobileProfile>(DEFAULT_PROFILE);

  useEffect(() => {
    const connection = (
      navigator as Navigator & {
        connection?: {
          saveData?: boolean;
          effectiveType?: string;
          addEventListener?: (type: string, listener: () => void) => void;
          removeEventListener?: (type: string, listener: () => void) => void;
        };
      }
    ).connection;

    function readProfile(): MobileProfile {
      const isMobile = window.matchMedia("(max-width: 768px)").matches;
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const saveData =
        connection?.saveData === true ||
        connection?.effectiveType === "slow-2g" ||
        connection?.effectiveType === "2g";
      const liteMode = isMobile || saveData || reducedMotion;
      return { isMobile, saveData, reducedMotion, liteMode };
    }

    setProfile(readProfile());

    const mobileMq = window.matchMedia("(max-width: 768px)");
    const motionMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setProfile(readProfile());

    mobileMq.addEventListener("change", onChange);
    motionMq.addEventListener("change", onChange);
    connection?.addEventListener?.("change", onChange);

    return () => {
      mobileMq.removeEventListener("change", onChange);
      motionMq.removeEventListener("change", onChange);
      connection?.removeEventListener?.("change", onChange);
    };
  }, []);

  return profile;
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
