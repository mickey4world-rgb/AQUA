/** User-Agent / クライアントヒントの軽量パース（外部依存なし） */

export type ParsedUserAgent = {
  browser: string;
  os: string;
  deviceType: "mobile" | "tablet" | "desktop" | "bot" | "unknown";
};

export function parseUserAgent(userAgent: string | null | undefined): ParsedUserAgent {
  const ua = userAgent?.trim() || "";
  if (!ua) {
    return { browser: "不明", os: "不明", deviceType: "unknown" };
  }

  if (/bot|crawler|spider|slurp|bingpreview|facebookexternalhit/i.test(ua)) {
    return { browser: "Bot", os: "—", deviceType: "bot" };
  }

  let os = "その他";
  if (/Windows NT/i.test(ua)) os = "Windows";
  else if (/Mac OS X|Macintosh/i.test(ua)) os = "macOS";
  else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/CrOS/i.test(ua)) os = "ChromeOS";
  else if (/Linux/i.test(ua)) os = "Linux";

  let browser = "その他";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/i.test(ua)) browser = "Opera";
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = "Chrome";
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = "Safari";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/SamsungBrowser/i.test(ua)) browser = "Samsung";

  let deviceType: ParsedUserAgent["deviceType"] = "desktop";
  if (/iPad|Tablet|Android(?!.*Mobile)/i.test(ua)) deviceType = "tablet";
  else if (/Mobi|iPhone|Android.*Mobile/i.test(ua)) deviceType = "mobile";

  return { browser, os, deviceType };
}

export function extractGeoFromHeaders(headers: Headers): {
  country: string | null;
  region: string | null;
  city: string | null;
} {
  const countryRaw =
    headers.get("cf-ipcountry") ||
    headers.get("cloudfront-viewer-country") ||
    headers.get("x-vercel-ip-country") ||
    headers.get("x-country-code") ||
    headers.get("x-appengine-country") ||
    null;
  const country =
    countryRaw && countryRaw !== "XX" && countryRaw !== "T1"
      ? countryRaw.trim().toUpperCase()
      : null;

  const region =
    headers.get("cf-region") ||
    headers.get("cloudfront-viewer-country-region") ||
    headers.get("x-vercel-ip-country-region") ||
    null;

  const city =
    headers.get("cf-ipcity") ||
    headers.get("x-vercel-ip-city") ||
    headers.get("x-appengine-city") ||
    null;

  return {
    country,
    region: region?.trim() || null,
    city: city ? decodeURIComponent(city.trim()) : null,
  };
}

export function primaryLanguage(acceptLanguage: string | null | undefined): string {
  if (!acceptLanguage) return "不明";
  const first = acceptLanguage.split(",")[0]?.trim() || "";
  return first.slice(0, 16) || "不明";
}
