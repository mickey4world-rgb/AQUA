import { withApiAccessLog } from "@/lib/server/api-access";
import { sanitizeText } from "@/lib/server/security";
import {
  imageStudioMeta,
  isSolunaImageStoreConfigured,
  listSolunaImages,
  saveSolunaImage,
} from "@/lib/server/soluna-images";

export const maxDuration = 60;

export async function GET(request: Request) {
  return withApiAccessLog(request, async (auth) => {
    if (!isSolunaImageStoreConfigured()) {
      return Response.json(
        { error: "Cosmos DB が未設定のため画像スタジオを利用できません。" },
        { status: 503 },
      );
    }
    const images = await listSolunaImages(auth.userId);
    return Response.json({
      images,
      ...imageStudioMeta(),
    });
  });
}

type UploadBody = {
  title?: string;
  dataUrl?: string;
};

export async function POST(request: Request) {
  return withApiAccessLog(request, async (auth) => {
    if (!isSolunaImageStoreConfigured()) {
      return Response.json(
        { error: "Cosmos DB が未設定のため画像スタジオを利用できません。" },
        { status: 503 },
      );
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }
    const body = raw as UploadBody;
    const dataUrl = typeof body.dataUrl === "string" ? body.dataUrl : "";
    if (!dataUrl.startsWith("data:image/")) {
      return Response.json({ error: "画像の data URL を送ってください。" }, { status: 400 });
    }

    try {
      const image = await saveSolunaImage({
        userId: auth.userId,
        title: sanitizeText(body.title ?? "アップロード画像", 80),
        source: "upload",
        dataUrl,
      });
      return Response.json({ image });
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : "アップロードに失敗しました" },
        { status: 422 },
      );
    }
  });
}
