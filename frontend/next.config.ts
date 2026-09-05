import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  distDir: process.env.NEXT_DIST_DIR || ".next",
  turbopack: {},
  // 行政事業レビューの同梱データ（gzip）を API ルートのトレースに含める。
  outputFileTracingIncludes: {
    "/api/works/money-flow/**/*": ["./data/gyosei/**/*"],
    "/api/public/works-money-flow/**/*": [
      "./data/gyosei/public-preview.json",
      "./data/gyosei/summary.json",
      "./data/gyosei/*.json.gz",
    ],
    "/works/admin/money-flow/**/*": ["./data/gyosei/**/*"],
    "/works-preview/**/*": ["./data/gyosei/public-preview.json"],
  },
};

export default nextConfig;
