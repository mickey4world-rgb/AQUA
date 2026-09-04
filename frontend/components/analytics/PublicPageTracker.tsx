"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { isPublicTrackablePath } from "@/lib/public-pages";

const VISITOR_KEY = "aqua_public_vid";

function getVisitorKey(): string {
  try {
    let vid = localStorage.getItem(VISITOR_KEY);
    if (!vid) {
      vid = crypto.randomUUID();
      localStorage.setItem(VISITOR_KEY, vid);
    }
    return vid;
  } catch {
    return "anonymous";
  }
}

function clientHints() {
  try {
    return {
      language: navigator.language || null,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
      screen:
        typeof window !== "undefined"
          ? `${window.screen.width}x${window.screen.height}`
          : null,
    };
  } catch {
    return { language: null, timezone: null, screen: null };
  }
}

/** 公開ページ／SHOWCASE セクションの PV 送信（同一セッション内は1回） */
export function trackPublicPageView(options: {
  pathname: string;
  section?: string | null;
}): void {
  const { pathname, section } = options;
  if (!isPublicTrackablePath(pathname)) return;

  const sessionKey = `pv:${pathname}:${section ?? "_"}`;
  try {
    if (sessionStorage.getItem(sessionKey)) return;
    sessionStorage.setItem(sessionKey, "1");
  } catch {
    // sessionStorage unavailable — still attempt one beacon
  }

  const hints = clientHints();
  fetch("/api/analytics/pageview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pathname,
      visitorKey: getVisitorKey(),
      referrer: document.referrer || null,
      section: section ?? null,
      language: hints.language,
      timezone: hints.timezone,
      screen: hints.screen,
    }),
    keepalive: true,
  }).catch(() => {});
}

export default function PublicPageTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || !isPublicTrackablePath(pathname)) return;
    // SHOWCASE 本体はセクション単位で StudioShowcase が送る
    if (pathname === "/sample") return;
    trackPublicPageView({ pathname });
  }, [pathname]);

  return null;
}
