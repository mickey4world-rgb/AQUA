export interface PageViewLog {
  id: string;
  pathname: string;
  pageLabel: string;
  visitorKey: string;
  referrer: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface RecordPageViewInput {
  pathname: string;
  visitorKey: string;
  referrer?: string | null;
  userAgent?: string | null;
}
