import { withApiAccessLog } from "@/lib/server/api-access";
import { sanitizeText } from "@/lib/server/security";
import {
  generateSolunaImage,
  isSolunaImageStoreConfigured,
} from "@/lib/server/soluna-images";

export const maxDuration = 120;

type Body = {
  prompt?: string;
  model?: string;
  matchBaseStyle?: boolean;
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
    const body = raw as Body;
    const prompt = sanitizeText(body.prompt ?? "", 800);
    if (!prompt) {
      return Response.json({ error: "プロンプトを入力してください" }, { status: 400 });
    }

    try {
      const result = await generateSolunaImage(auth.userId, prompt, {
        model: body.model,
        matchBaseStyle: body.matchBaseStyle !== false,
      });
      return Response.json(result);
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : "画像生成に失敗しました" },
        { status: 422 },
      );
    }
  });
}
