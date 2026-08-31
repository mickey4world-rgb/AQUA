import WorksMoneyFlowPublicPreview from "@/components/works/admin/WorksMoneyFlowPublicPreview";

export const metadata = {
  title: "行政事業レビュー サンキー | AQUA",
  description:
    "行政事業レビューの予算データをサンキー図と明細で無料公開。府省庁→主要事業→支出先の流れを可視化。",
};

export default function WorksPreviewPage() {
  return <WorksMoneyFlowPublicPreview />;
}
