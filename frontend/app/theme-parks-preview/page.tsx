import ThemeParksPublicPreview from "@/components/theme-parks/ThemeParksPublicPreview";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "テーマパーク混雑予測・ディズニー＆USJ | AQUA SHOWCASE",
  description:
    "東京ディズニーリゾートとユニバーサル・スタジオ・ジャパンの混雑予測を無料公開。カレンダー・キャラクターアドバイス付き。",
  alternates: { canonical: "/theme-parks-preview" },
  robots: { index: true, follow: true },
  keywords: [
    "テーマパーク 混雑予測",
    "東京ディズニーランド 混雑予測",
    "東京ディズニーシー 混雑予測",
    "USJ 混雑予測",
    "ユニバーサルスタジオジャパン 混雑",
    "AQUA SHOWCASE",
  ],
  openGraph: {
    url: "/theme-parks-preview",
    type: "website",
    title: "テーマパーク混雑予測 | AQUA",
    description:
      "ディズニーとUSJの今日・明日の混雑状況、カレンダー、キャラクターアドバイスを公開。",
  },
};

export default function ThemeParksPreviewPage() {
  return <ThemeParksPublicPreview />;
}
