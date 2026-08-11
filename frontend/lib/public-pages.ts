/** 認証不要の公開フロント — ページビュー計測対象 */
export const PUBLIC_PAGE_LABELS: Record<string, string> = {
  "/": "ホーム",
  "/sample": "SHOWCASE",
  "/login": "ログイン",
};

export function isPublicTrackablePath(pathname: string): boolean {
  return pathname in PUBLIC_PAGE_LABELS;
}

export function publicPageLabel(pathname: string): string {
  return PUBLIC_PAGE_LABELS[pathname] ?? pathname;
}
