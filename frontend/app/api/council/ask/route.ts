import { withApiAccessLog } from "@/lib/server/api-access";
import { runCouncilDebate } from "@/lib/server/council-orchestrator";
import type { CouncilDepth, CouncilMode } from "@/lib/types/council";

export const runtime = "nodejs";
export const maxDuration = 120;

type AskBody = {
  topic?: string;
  mode?: CouncilMode;
  depth?: CouncilDepth;
  attachments?: unknown;
};

export async function POST(request: Request) {
  return withApiAccessLog(request, async (auth) => {
    try {
      let body: AskBody;
      try {
        body = (await request.json()) as AskBody;
      } catch {
        return Response.json({ error: "Invalid JSON" }, { status: 400 });
      }

      const mode = body.mode ?? "domestic";
      if (mode !== "domestic" && mode !== "global") {
        return Response.json({ error: "Invalid mode" }, { status: 400 });
      }

      const depth = body.depth ?? "compact";
      if (depth !== "compact" && depth !== "standard") {
        return Response.json({ error: "Invalid depth" }, { status: 400 });
      }

      const result = await runCouncilDebate(
        auth.userId,
        body.topic ?? "",
        mode,
        depth,
        body.attachments ?? null,
      );
      if (!result.ok) {
        return Response.json({ error: result.reason }, { status: 422 });
      }

      return Response.json(result.result);
    } catch (error) {
      console.error("[council/ask]", error);
      return Response.json(
        {
          error:
            error instanceof Error
              ? `AI 合議に失敗しました: ${error.message}`
              : "AI 合議に失敗しました",
        },
        { status: 500 },
      );
    }
  });
}
