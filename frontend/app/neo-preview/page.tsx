import NeoPublicPreview from "@/components/space/NeoPublicPreview";
import { getNeoPublicPreview } from "@/lib/server/neo-public-preview";
import type { NeoPublicPreviewSnapshot } from "@/lib/types/space";

export const metadata = {
  title: "小惑星 3D プレビュー | AQUA",
  description:
    "JPL 接近データに基づく地球接近小惑星の 3D 軌道シミュレーター無料プレビュー。本日最接近の小惑星を表示。",
};

export const revalidate = 3600;
export const dynamic = "force-dynamic";

export default async function NeoPreviewPage() {
  let initialData: NeoPublicPreviewSnapshot | null = null;
  try {
    initialData = await getNeoPublicPreview();
  } catch {
    // クライアント側で再取得
  }

  return <NeoPublicPreview initialData={initialData} />;
}
