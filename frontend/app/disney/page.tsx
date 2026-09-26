import { redirect } from "next/navigation";

/** 旧 URL 互換。ホーム／ナビは /theme-parks を正とする。 */
export default function DisneyRedirectPage() {
  redirect("/theme-parks?tab=disney");
}
