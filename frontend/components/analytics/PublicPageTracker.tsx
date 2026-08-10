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

export default function PublicPageTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || !isPublicTrackablePath(pathname)) return;

    const sessionKey = `pv:${pathname}`;
    try {
      if (sessionStorage.getItem(sessionKey)) return;
      sessionStorage.setItem(sessionKey, "1");
    } catch {
      // sessionStorage unavailable — still attempt one beacon
    }

    fetch("/api/analytics/pageview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pathname,
        visitorKey: getVisitorKey(),
        referrer: document.referrer || null,
      }),
      keepalive: true,
    }).catch(() => {});
  }, [pathname]);

  return null;
}
