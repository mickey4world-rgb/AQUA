import { getNasaApiKey, fetchNasaJson } from "@/lib/server/nasa-client";
import { inferApodAnalysis } from "@/lib/space-utils";
import type { ApodAnalysis, ApodEntry } from "@/lib/types/space";

type RawApod = {
  date: string;
  title: string;
  explanation: string;
  url: string;
  hdurl?: string;
  media_type: string;
  copyright?: string;
  service_version?: string;
};

function normalizeApod(raw: RawApod): ApodEntry | null {
  if (raw.media_type !== "image") return null;
  return {
    date: raw.date,
    title: raw.title,
    explanation: raw.explanation,
    url: raw.url,
    hdurl: raw.hdurl,
    mediaType: "image",
    copyright: raw.copyright,
    serviceVersion: raw.service_version,
  };
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export type ApodTimelineResult =
  | { ok: true; entries: ApodEntry[]; days: number }
  | { ok: false; reason: string };

export async function fetchApodTimeline(days = 21): Promise<ApodTimelineResult> {
  const capped = Math.min(Math.max(days, 7), 30);
  const startDate = daysAgoIso(capped);
  const endDate = daysAgoIso(0);
  const key = getNasaApiKey();

  try {
    const url = `https://api.nasa.gov/planetary/apod?api_key=${key}&start_date=${startDate}&end_date=${endDate}`;
    const data = await fetchNasaJson<RawApod | RawApod[]>(url);
    const list = Array.isArray(data) ? data : [data];

    const entries = list
      .map(normalizeApod)
      .filter((e): e is ApodEntry => Boolean(e))
      .sort((a, b) => (a.date < b.date ? 1 : -1));

    return { ok: true, entries, days: capped };
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof Error
          ? `APOD の取得に失敗しました: ${error.message}`
          : "APOD の取得に失敗しました",
    };
  }
}

export function analyzeApodEntry(entry: ApodEntry): ApodAnalysis {
  return inferApodAnalysis(entry.title, entry.explanation);
}
