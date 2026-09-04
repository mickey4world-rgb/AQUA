export interface PageViewLog {
  id: string;
  pathname: string;
  pageLabel: string;
  /** home | showcase | showcase-detail | login | preview | other */
  pageGroup: string;
  /** SHOWCASE 内セクション id（sankey 等） */
  section: string | null;
  visitorKey: string;
  referrer: string | null;
  userAgent: string | null;
  browser: string | null;
  os: string | null;
  deviceType: string | null;
  language: string | null;
  timezone: string | null;
  screen: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  createdAt: string;
}

export interface RecordPageViewInput {
  pathname: string;
  visitorKey: string;
  referrer?: string | null;
  userAgent?: string | null;
  section?: string | null;
  language?: string | null;
  timezone?: string | null;
  screen?: string | null;
  country?: string | null;
  region?: string | null;
  city?: string | null;
  acceptLanguage?: string | null;
}
