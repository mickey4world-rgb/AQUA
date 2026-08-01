import { withApiAccessLog } from "@/lib/server/api-access";
import { runCouncilDebate } from "@/lib/server/council-orchestrator";
import type { CouncilDepth, CouncilMode } from "@/lib/types/council";

type AskBody = {
  topic?: string;
  mode?: CouncilMode;
  depth?: CouncilDepth;
};

export async function POST(request: Request) {
  return withApiAccessLog(request, async (auth) => {
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
    );
    if (!result.ok) {
      return Response.json({ error: result.reason }, { status: 422 });
    }

    return Response.json(result.result);
  });
}
