import { withApiAccessLog } from "@/lib/server/api-access";
import { sanitizeText } from "@/lib/server/security";
import { parseTravelMaterial } from "@/lib/server/travel-parse";
import { retrieveTravelMaterialContext } from "@/lib/server/travel-rag";
import {
  getTravelTrip,
  isTravelStoreConfigured,
  replaceTravelStops,
  updateTravelTrip,
} from "@/lib/server/travel-store";

/** SWA マネージド API は実質 ~30s。ジオコード／天気は別 API に分離 */
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Ctx) {
  return withApiAccessLog(request, async (auth) => {
    if (!isTravelStoreConfigured()) {
      return Response.json({ error: "Cosmos DB 未設定" }, { status: 503 });
    }
    const { id } = await context.params;
    const trip = await getTravelTrip(auth.userId, id);
    if (!trip) return Response.json({ error: "見つかりません" }, { status: 404 });

    let body: { text?: string; useMaterials?: boolean };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const pasted = sanitizeText(body.text ?? "", 12000);
    const useMaterials = body.useMaterials !== false;
    const materials = trip.materials ?? [];

    let ragBlock = "";
    let ragMeta: { usedChunkCount: number; materialNames: string[] } | null =
      null;
    if (useMaterials && materials.length > 0) {
      try {
        const retrieved = retrieveTravelMaterialContext({
          materials,
          trip,
          extraQuery: pasted,
        });
        ragBlock = retrieved.text;
        ragMeta = {
          usedChunkCount: retrieved.usedChunkCount,
          materialNames: retrieved.materialNames,
        };
      } catch (err) {
        console.error("[travel-parse] RAG retrieve failed", err);
        return Response.json(
          {
            error:
              "アップロード資料の読み出しに失敗しました。資料を削除して再アップロードするか、テキストを貼り付けてください。",
          },
          { status: 422 },
        );
      }
    }

    const text = [ragBlock, pasted ? `\n【追加メモ】\n${pasted}` : ""]
      .filter(Boolean)
      .join("\n")
      .trim();

    if (!text || text.replace(/\s/g, "").length < 20) {
      return Response.json(
        {
          error:
            "判読する本文がありません。電子ファイルをアップロードするか、テキストを貼り付けてください。",
        },
        { status: 400 },
      );
    }

    try {
      // 座標取得はしない（SWA タイムアウトの主因）。クライアントが /geocode を続けて呼ぶ。
      const parsed = await parseTravelMaterial({
        text,
        destinationHint: trip.destination,
        startDate: trip.startDate,
        endDate: trip.endDate,
        maxGeocode: 0,
      });

      let next = await replaceTravelStops(
        auth.userId,
        id,
        parsed.stops,
        text.slice(0, 1500),
      );
      if (parsed.tripTitle || parsed.summary) {
        next = await updateTravelTrip(auth.userId, id, {
          title: parsed.tripTitle || undefined,
          summary: parsed.summary || undefined,
        });
      }
      return Response.json({
        trip: next,
        parsedStopCount: parsed.stops.length,
        provider: parsed.provider,
        rag: ragMeta,
        needsGeocode: parsed.stops.some((s) => s.lat == null || s.lon == null),
      });
    } catch (err) {
      console.error("[travel-parse] failed", err);
      return Response.json(
        {
          error:
            err instanceof Error
              ? err.message
              : "解析に失敗しました。しばらくしてから再試行してください。",
        },
        { status: 422 },
      );
    }
  });
}
