import { withApiAccessLog } from "@/lib/server/api-access";
import { buildPptxFromOutline } from "@/lib/server/docs-pptx";
import { consultVisualToOutline } from "@/lib/consult-visual-utils";
import { parseJsonBody, sanitizeText } from "@/lib/server/security";
import type { ConsultVisualDocument } from "@/lib/types/consult-visual";

type ExportRequestBody = {
  visual?: ConsultVisualDocument;
  reply?: string;
};

export async function POST(request: Request) {
  return withApiAccessLog(request, async () => {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const body = parseJsonBody<ExportRequestBody>(raw);
    if (!body?.visual || typeof body.visual.title !== "string") {
      return Response.json({ error: "visual が必要です" }, { status: 400 });
    }

    const reply =
      typeof body.reply === "string" ? sanitizeText(body.reply, 4000) : undefined;

    try {
      const outline = consultVisualToOutline(body.visual, reply);
      const { base64, fileName } = await buildPptxFromOutline(outline);
      return Response.json({ base64, fileName });
    } catch {
      return Response.json({ error: "PPTX の生成に失敗しました" }, { status: 500 });
    }
  });
}
