import WorksMoneyFlowPublicPreview from "@/components/works/admin/WorksMoneyFlowPublicPreview";
import { getWorksMoneyFlowPublicPreview } from "@/lib/server/gyosei-public-preview";
import type { MoneyFlowResponse } from "@/lib/types/gyosei";

export const metadata = {
  title: "行政事業レビュー サンキー | AQUA",
  description:
    "行政事業レビューの予算データをサンキー図と明細で無料公開。府省庁→主要事業→支出先の流れを可視化。",
};

export const revalidate = 3600;

export default async function WorksPreviewPage() {
  let initialData: MoneyFlowResponse | null = null;
  try {
    initialData = await getWorksMoneyFlowPublicPreview();
  } catch {
    // クライアント側で再取得
  }

  return <WorksMoneyFlowPublicPreview initialData={initialData} />;
}
