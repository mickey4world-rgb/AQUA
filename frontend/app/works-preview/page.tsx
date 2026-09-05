import WorksMoneyFlowPublicPreview from "@/components/works/admin/WorksMoneyFlowPublicPreview";
import { getWorksMoneyFlowPublicPreview } from "@/lib/server/gyosei-public-preview";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "行政事業レビュー サンキー | AQUA",
  description:
    "行政事業レビューの予算データをサンキー図と明細で無料公開。府省庁→主要事業→支出先の流れを可視化。",
  alternates: { canonical: "/works-preview" },
  robots: { index: true, follow: true },
  keywords: ["行政事業レビュー", "予算 可視化", "サンキー図", "府省庁 支出先"],
  openGraph: {
    url: "/works-preview",
    type: "website",
    title: "行政事業レビュー予算サンキー | AQUA",
    description: "府省庁から事業、支出先までの公金の流れをサンキー図で公開。",
  },
};

/** 表示は同梱スナップショットのみ。リクエスト時の集計はしない。 */
export const dynamic = "force-static";
export const revalidate = false;

export default async function WorksPreviewPage() {
  const initialData = await getWorksMoneyFlowPublicPreview();
  return <WorksMoneyFlowPublicPreview initialData={initialData} />;
}
