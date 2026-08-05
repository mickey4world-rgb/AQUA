import { withApiAccessLog } from "@/lib/server/api-access";
import { EAGLE_EYE_SATELLITES } from "@/lib/eagle-eye-data";
import { computeAllTracks } from "@/lib/eagle-eye-satellite";

export async function GET(request: Request) {
  return withApiAccessLog(request, async () => {
    const referenceTime = new Date();
    const tracks = computeAllTracks(EAGLE_EYE_SATELLITES, referenceTime);

    return Response.json({
      referenceTime: referenceTime.toISOString(),
      tracks: tracks.map((t) => ({
        satellite: t.satellite,
        nowIndex: t.nowIndex,
        positions: t.positions.map((p) => ({
          time: p.time.toISOString(),
          lat: p.lat,
          lon: p.lon,
          altKm: p.altKm,
          offsetMinutes: p.offsetMinutes,
        })),
      })),
    });
  });
}
