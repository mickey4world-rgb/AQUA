import { redirect } from "next/navigation";

/** 資料生成は WORKS 配下へ移動。旧 URL は互換のため転送する。 */
export default function DocsPage() {
  redirect("/works/docs");
}
