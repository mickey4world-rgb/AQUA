import { fetchJplJson } from "@/lib/server/nasa-client";
import { auToKm, auToLunarDistances } from "@/lib/space-utils";
import type { CloseApproach } from "@/lib/types/space";

type CadResponse = {
  count: number;
  total: number;
  fields: string[];
  data: (string | number)[][];
};

function magnitudeToDiameterKm(h: number): number | undefined {
  if (!Number.isFinite(h)) return undefined;
  const albedo = 0.14;
  const d = (1329 / Math.sqrt(albedo)) * Math.pow(10, -0.2 * h);
  return Number.isFinite(d) ? Math.round(d * 10) / 10 : undefined;
}

function parseRow(fields: string[], row: (string | number)[]): CloseApproach | null {
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
  const fullName = fullIdx >= 0 ? String(row[fullIdx] ?? "") : undefined;

  return {
    designation: des,
    fullName: fullName || undefined,
    closeApproachDate: cd,
    distanceAu: dist,
    distanceMinAu: distMin,
    distanceMaxAu: distMax,
    distanceMinLd: auToLunarDistances(distMin),
    distanceMinKm: auToKm(distMin),
    velocityKmS: vRel,
    absoluteMagnitude: h,
    diameterKm: magnitudeToDiameterKm(h),
  };
}

export type NeoFeedResult =
  | { ok: true; approaches: CloseApproach[]; total: number }
  | { ok: false; reason: string };

export async function fetchCloseApproaches(limit = 25): Promise<NeoFeedResult> {
  try {
    const url = `https://ssd-api.jpl.nasa.gov/cad.api?date-min=now&date-max=%2B730&dist-max=0.2&sort=dist&limit=${limit}`;
    const data = await fetchJplJson<CadResponse>(url);

    const approaches = data.data
      .map((row) => parseRow(data.fields, row))
      .filter((a): a is CloseApproach => Boolean(a));

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
