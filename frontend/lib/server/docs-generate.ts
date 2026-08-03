import { buildPptxFromOutline } from "@/lib/server/docs-pptx";
import { generateDocOutline } from "@/lib/server/docs-outline-ai";
import type {
  DocOutline,
  DocsChatMessage,
  DocsGenerateResponse,
} from "@/lib/types/docs";

export type DocsGenerateResult =
  | ({ ok: true } & DocsGenerateResponse)
  | { ok: false; reason: string };

export async function runDocsGenerate(
  userId: string,
  message: string,
  history: DocsChatMessage[] = [],
  previousOutline: DocOutline | null = null,
  attachmentsInput: unknown = null,
): Promise<DocsGenerateResult> {
  const aiResult = await generateDocOutline(
    userId,
    message,
    history,
    previousOutline,
    attachmentsInput,
  );

  if (!aiResult.ok) {
    return aiResult;
  }

  try {
    const { base64, fileName } = await buildPptxFromOutline(aiResult.outline);

    return {
      ok: true,
      outline: aiResult.outline,
      reply: aiResult.reply,
      pptxBase64: base64,
      fileName,
      model: aiResult.model,
      slideCount: aiResult.outline.slides.length,
    };
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof Error
          ? `PowerPoint 生成に失敗しました: ${error.message}`
          : "PowerPoint 生成に失敗しました",
    };
  }
}
