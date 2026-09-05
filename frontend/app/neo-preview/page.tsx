import NeoPublicPreview from "@/components/space/NeoPublicPreview";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "小惑星 3D プレビュー | AQUA",
  description:
    "JPL 接近データに基づく地球接近小惑星の 3D 軌道シミュレーター無料プレビュー。本日最接近の小惑星を表示。",
  alternates: { canonical: "/neo-preview" },
  robots: { index: true, follow: true },
  keywords: ["地球接近小惑星", "小惑星 3D", "NASA JPL", "宇宙シミュレーション"],
  openGraph: {
    url: "/neo-preview",
    type: "website",
    title: "地球接近小惑星3D | AQUA",
    description: "NASA JPLデータを使った地球接近小惑星の公開3Dシミュレーター。",
  },
};

export const dynamic = "force-dynamic";

export default function NeoPreviewPage() {
  return <NeoPublicPreview />;
}
