import DisneyPublicPreview from "@/components/disney/DisneyPublicPreview";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "東京ディズニーリゾート混雑予測・今日の状況 | AQUA SHOWCASE",
  description:
    "東京ディズニーランド・東京ディズニーシーの今日の状況、混雑予測カレンダー、時間帯別予想を無料公開。ベイマックスとエルサのアドバイス付き。",
  alternates: { canonical: "/tdr-preview" },
  robots: { index: true, follow: true },
  keywords: [
    "東京ディズニーランド 混雑予測",
    "東京ディズニーシー 混雑予測",
    "TDR 今日 混雑",
    "ディズニー 待ち時間",
    "AQUA SHOWCASE",
  ],
  openGraph: {
    url: "/tdr-preview",
    type: "website",
    title: "東京ディズニーリゾート混雑予測 | AQUA",
    description:
      "ランドとシーの今日・明日の混雑状況、時間帯別予測、カレンダーを公開。",
  },
};

export default function TdrPreviewPage() {
  return <DisneyPublicPreview />;
}
