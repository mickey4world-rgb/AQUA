import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: [
        "/",
        "/sample",
        "/profile",
        "/tdr-preview",
        "/theme-parks-preview",
        "/works-preview",
        "/neo-preview",
      ],
      disallow: [
        "/api/",
        "/stocks/",
        "/disney/",
        "/theme-parks",
        "/theme-parks/",
        "/costs/",
        "/council/",
        "/soluna/",
        "/docs/",
        "/works/",
        "/space/",
        "/settings",
        "/login",
        "/.auth/",
      ],
    },
    sitemap: "https://www.aquacore.net/sitemap.xml",
    host: "https://www.aquacore.net",
  };
}
