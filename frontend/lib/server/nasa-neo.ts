import { fetchJplJson } from "@/lib/server/nasa-client";
import {
  estimateApproachImpactProbability,
  formatCloseApproachJst,
  formatImpactProbabilityPercent,
  pickNearbyRegions,
} from "@/lib/asteroid-risk";
import { parseCloseApproachDate } from "@/lib/space-utils";
import { auToKm, auToLunarDistances } from "@/lib/space-utils";
import type { CloseApproach } from "@/lib/types/space";

type CadResponse = {
  count: number;
  total: number;
  fields: string[];
  data: (string | number)[][];
};

type SentrySummaryResponse = {
  count?: number;
  data?: Array<{ des?: string; ip?: string; fullname?: string }>;
  error?: string;
};

function magnitudeToDiameterKm(h: number): number | undefined {
  if (!Number.isFinite(h)) return undefined;
  const albedo = 0.14;
  const d = (1329 / Math.sqrt(albedo)) * Math.pow(10, -0.2 * h);
  return Number.isFinite(d) ? Math.round(d * 1000) / 1000 : undefined;
}

async function fetchSentryIpMap(): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  try {
    const data = await fetchJplJson<SentrySummaryResponse>(
      "https://ssd-api.jpl.nasa.gov/sentry.api",
    );
    for (const row of data.data ?? []) {
      const des = String(row.des ?? "").trim();
      const ip = Number(row.ip);
      if (des && Number.isFinite(ip) && ip > 0) {
        map.set(des, ip);
        map.set(des.replace(/\s+/g, ""), ip);
      }
    }
  } catch {
    // Sentry が取れなくても CAD だけで続行
  }
  return map;
}

function parseRow(
  fields: string[],
  row: (string | number)[],
  sentryIp: Map<string, number>,
): CloseApproach | null {
  const idx = (name: string) => fields.indexOf(name);
  const des = String(row[idx("des")] ?? "").trim();
  const cd = String(row[idx("cd")] ?? "").trim();
  const distMin = Number(row[idx("dist_min")]);
  const dist = Number(row[idx("dist")]);
  const distMax = Number(row[idx("dist_max")]);
  const vRel = Number(row[idx("v_rel")]);
  const h = Number(row[idx("h")]);

  if (!des || !cd || !Number.isFinite(distMin)) return null;

  const fullIdx = fields.indexOf("fullname");
  const fullName = fullIdx >= 0 ? String(row[fullIdx] ?? "").trim() : undefined;

  const diameterIdx = fields.indexOf("diameter");
  const diameterRaw =
    diameterIdx >= 0 ? Number(row[diameterIdx]) : Number.NaN;
  const diameterKm = Number.isFinite(diameterRaw)
    ? diameterRaw
    : magnitudeToDiameterKm(h);

  const { jst, at } = formatCloseApproachJst(cd);

  const impactProbability = estimateApproachImpactProbability({
    distanceAu: dist,
    distanceMinAu: distMin,
    distanceMaxAu: distMax,
    diameterKm,
  });

  const sentry =
    sentryIp.get(des) ??
    sentryIp.get(des.replace(/\s+/g, "")) ??
    undefined;

  return {
    designation: des,
    fullName: fullName || undefined,
    closeApproachDate: cd,
    closeApproachDateJst: jst,
    closeApproachAt: at || parseCloseApproachDate(cd),
    distanceAu: dist,
    distanceMinAu: distMin,
    distanceMaxAu: distMax,
    distanceMinLd: auToLunarDistances(distMin),
    distanceMinKm: auToKm(distMin),
    velocityKmS: vRel,
    absoluteMagnitude: h,
    diameterKm,
    impactProbability,
    impactProbabilityLabel: formatImpactProbabilityPercent(impactProbability),
    sentryImpactProbability: sentry,
    sentryImpactProbabilityLabel:
      sentry !== undefined
        ? formatImpactProbabilityPercent(sentry)
        : undefined,
    nearbyRegions: pickNearbyRegions(
      `${des}|${cd}`,
      Math.max(impactProbability, sentry ?? 0),
    ),
  };
}

export type NeoFeedResult =
  | { ok: true; approaches: CloseApproach[]; total: number }
  | { ok: false; reason: string };

export async function fetchCloseApproaches(limit = 25): Promise<NeoFeedResult> {
  try {
    const url =
      `https://ssd-api.jpl.nasa.gov/cad.api?date-min=now&date-max=%2B730&dist-max=0.2&sort=date&limit=${limit}&fullname=true&diameter=true`;
    const [data, sentryIp] = await Promise.all([
      fetchJplJson<CadResponse>(url),
      fetchSentryIpMap(),
    ]);

    const approaches = data.data
      .map((row) => parseRow(data.fields, row, sentryIp))
      .filter((a): a is CloseApproach => Boolean(a))
      .sort((a, b) => a.closeApproachAt - b.closeApproachAt);

    return { ok: true, approaches, total: data.total };
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof Error
          ? `小惑星データの取得に失敗しました: ${error.message}`
          : "小惑星データの取得に失敗しました",
    };
  }
}

type NasaImageSearch = {
  collection?: {
    items?: Array<{
      href?: string;
      data?: Array<{ title?: string; nasa_id?: string; description?: string }>;
      links?: Array<{ href?: string; rel?: string; render?: string }>;
    }>;
  };
};

export async function findAsteroidImage(query: string): Promise<{
  url?: string;
  credit?: string;
}> {
  const q = query.trim();
  if (!q) return {};
  try {
    const url = `https://images-api.nasa.gov/search?q=${encodeURIComponent(`asteroid ${q}`)}&media_type=image`;
    const res = await fetch(url, { next: { revalidate: 86_400 } });
    if (!res.ok) return {};
    const data = (await res.json()) as NasaImageSearch;
    const item = data.collection?.items?.find((entry) =>
      entry.links?.some((link) => link.render === "image" || link.rel === "preview"),
    );
    const preview = item?.links?.find(
      (link) => link.render === "image" || link.rel === "preview",
    )?.href;
    if (!preview) return {};
    return {
      url: preview,
      credit: item?.data?.[0]?.title
        ? `NASA Image: ${item.data[0].title}`
        : "NASA Images",
    };
  } catch {
    return {};
  }
}
