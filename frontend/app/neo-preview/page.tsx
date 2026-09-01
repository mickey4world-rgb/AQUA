import NeoPublicPreview from "@/components/space/NeoPublicPreview";

export const metadata = {
  title: "小惑星 3D プレビュー | AQUA",
  description:
    "JPL 接近データに基づく地球接近小惑星の 3D 軌道シミュレーター無料プレビュー。本日最接近の小惑星を表示。",
};

export const dynamic = "force-dynamic";

export default function NeoPreviewPage() {
  return <NeoPublicPreview />;
}
