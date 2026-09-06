import NewsSearchPublicPreview from "@/components/works/NewsSearchPublicPreview";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ニュースサーチ（無料プレビュー）| AQUA SHOWCASE",
  description:
    "深夜バッチで集約した AI・システム・経済・官公庁ニュースと解説を無料公開。AI相談はログイン後。",
  alternates: { canonical: "/news-search-preview" },
  robots: { index: true, follow: true },
  openGraph: {
    url: "/news-search-preview",
    title: "ニュースサーチ無料プレビュー | AQUA",
    description: "バッチ取得のニュース解説を認証なしで閲覧できます。",
  },
};

export default function NewsSearchPreviewPage() {
  return <NewsSearchPublicPreview />;
}
