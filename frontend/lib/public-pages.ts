/** 認証不要の公開フロント — ページビュー計測対象 */

export const PUBLIC_PAGE_LABELS: Record<string, string> = {
  "/": "HOME",
  "/sample": "SHOWCASE",
  "/login": "ログイン",
  "/tdr-preview": "SHOWCASE詳細 · TDRプレビュー",
  "/works-preview": "SHOWCASE詳細 · サンキープレビュー",
  "/neo-preview": "SHOWCASE詳細 · NEOプレビュー",
};

export const SHOWCASE_SECTION_LABELS: Record<string, string> = {
  intro: "SHOWCASE · 導入",
  sankey: "SHOWCASE · サンキー",
  judicial: "SHOWCASE · 訴訟記録",
  council: "SHOWCASE · AI合議",
  stocks: "SHOWCASE · 保有株",
  disney: "SHOWCASE · ディズニー",
  asteroid: "SHOWCASE · 小惑星",
  soluna: "SHOWCASE · Soluna",
};

export function isPublicTrackablePath(pathname: string): boolean {
  return pathname in PUBLIC_PAGE_LABELS;
}

export function publicPageLabel(pathname: string, section?: string | null): string {
  if (pathname === "/sample" && section) {
    return SHOWCASE_SECTION_LABELS[section] ?? `SHOWCASE · ${section}`;
  }
  return PUBLIC_PAGE_LABELS[pathname] ?? pathname;
}

export function publicPageGroup(
  pathname: string,
  section?: string | null,
): "home" | "showcase" | "showcase-detail" | "login" | "preview" | "other" {
  if (pathname === "/") return "home";
  if (pathname === "/login") return "login";
  if (pathname === "/sample") {
    return section && section !== "intro" ? "showcase-detail" : "showcase";
  }
  if (
    pathname === "/tdr-preview" ||
    pathname === "/works-preview" ||
    pathname === "/neo-preview"
  ) {
    return "preview";
  }
  return "other";
}

export const PAGE_GROUP_LABELS: Record<string, string> = {
  home: "HOME",
  showcase: "SHOWCASE",
  "showcase-detail": "SHOWCASE詳細",
  login: "ログイン",
  preview: "公開プレビュー",
  other: "その他",
};
