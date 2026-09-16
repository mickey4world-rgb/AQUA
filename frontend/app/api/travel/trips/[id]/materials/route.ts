import { withApiAccessLog } from "@/lib/server/api-access";
import {
  extractTravelMaterialFile,
  TRAVEL_MATERIAL_MAX_FILES,
} from "@/lib/server/travel-material-extract";
import {
  addTravelMaterials,
  deleteTravelMaterial,
  getTravelTrip,
  isTravelStoreConfigured,
} from "@/lib/server/travel-store";
import type { TravelMaterialUploadFile } from "@/lib/types/travel";

export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Ctx) {
  return withApiAccessLog(request, async (auth) => {
    if (!isTravelStoreConfigured()) {
      return Response.json({ error: "Cosmos DB 未設定" }, { status: 503 });
    }
    const { id } = await context.params;
    const trip = await getTravelTrip(auth.userId, id);
    if (!trip) return Response.json({ error: "見つかりません" }, { status: 404 });

    let body: { files?: TravelMaterialUploadFile[] };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const files = Array.isArray(body.files) ? body.files : [];
    if (!files.length) {
      return Response.json({ error: "ファイルを送ってください" }, { status: 400 });
    }
    for (const file of files) {
      if (!file?.name) {
        return Response.json({ error: "ファイル名が空です" }, { status: 400 });
      }
      if (!file.extractedText?.trim() && !file.base64?.trim()) {
        return Response.json(
          { error: `${file.name}: 本文もファイルデータもありません` },
          { status: 400 },
        );
      }
    }
    if (files.length > TRAVEL_MATERIAL_MAX_FILES) {
      return Response.json(
        { error: `一度にアップロードできるのは ${TRAVEL_MATERIAL_MAX_FILES} 件までです` },
        { status: 400 },
      );
    }

    try {
      const materials = [];
      for (const file of files) {
        materials.push(
          await extractTravelMaterialFile({
            name: file.name,
            mimeType: file.mimeType,
            base64: file.base64,
            extractedText: file.extractedText,
            extractMethodHint: file.extractMethodHint,
          }),
        );
      }
      const next = await addTravelMaterials(auth.userId, id, materials);
      return Response.json(
        {
          trip: next,
          added: materials.map((m) => ({
            id: m.id,
            fileName: m.fileName,
            kind: m.kind,
            chunkCount: m.chunkCount,
            extractedChars: m.extractedChars,
            extractMethod: m.extractMethod,
          })),
        },
        { status: 201 },
      );
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : "資料の取り込みに失敗" },
        { status: 422 },
      );
    }
  });
}

export async function DELETE(request: Request, context: Ctx) {
  return withApiAccessLog(request, async (auth) => {
    if (!isTravelStoreConfigured()) {
      return Response.json({ error: "Cosmos DB 未設定" }, { status: 503 });
    }
    const { id } = await context.params;
    let materialId = "";
    try {
      const body = (await request.json()) as { materialId?: string };
      materialId = body.materialId?.trim() || "";
    } catch {
      return Response.json({ error: "materialId が必要です" }, { status: 400 });
    }
    if (!materialId) {
      return Response.json({ error: "materialId が必要です" }, { status: 400 });
    }
    try {
      const trip = await deleteTravelMaterial(auth.userId, id, materialId);
      return Response.json({ trip });
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : "削除に失敗" },
        { status: 422 },
      );
    }
  });
}
