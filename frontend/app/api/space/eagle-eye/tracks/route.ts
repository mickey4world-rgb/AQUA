import { withApiAccessLog } from "@/lib/server/api-access";
import { computeAllTracks } from "@/lib/eagle-eye-satellite";
import { getEagleEyeSatelliteCatalog } from "@/lib/server/eagle-eye-catalog";

export async function GET(request: Request) {
  return withApiAccessLog(request, async () => {
    const referenceTime = new Date();
    const satellites = await getEagleEyeSatelliteCatalog();
    const tracks = computeAllTracks(satellites, referenceTime);

    return Response.json({
      referenceTime: referenceTime.toISOString(),
      satellites,
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
