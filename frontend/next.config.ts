import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {},
  // 行政事業レビューの同梱データ（gzip）を API ルートのトレースに含める。
  outputFileTracingIncludes: {
    "/api/works/money-flow/**/*": ["./data/gyosei/**/*"],
    "/works/admin/money-flow/**/*": ["./data/gyosei/**/*"],
  },
};

export default nextConfig;
