import { withApiAccessLog } from "@/lib/server/api-access";
import {
  runCouncilDebaterStep,
  runCouncilJudgeStep,
} from "@/lib/server/council-orchestrator";
import type {
  CouncilDepth,
  CouncilMode,
  CouncilModelOpinion,
} from "@/lib/types/council";

type StepBody = {
  topic?: string;
  mode?: CouncilMode;
  depth?: CouncilDepth;
  attachments?: unknown;
  step?: "debater" | "judge";
  phase?: "initial" | "rebuttal";
  modelId?: string;
  initial?: CouncilModelOpinion[];
  rebuttal?: CouncilModelOpinion[];
};

export async function POST(request: Request) {
  return withApiAccessLog(request, async (auth) => {
    let body: StepBody;
    try {
      body = (await request.json()) as StepBody;
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

    if (body.step === "judge") {
      const result = await runCouncilJudgeStep(
        auth.userId,
        body.topic ?? "",
        mode,
        depth,
        body.attachments ?? null,
        Array.isArray(body.initial) ? body.initial : [],
        Array.isArray(body.rebuttal) ? body.rebuttal : [],
      );
      if (!result.ok) {
        return Response.json({ error: result.reason }, { status: 422 });
      }
      return Response.json(result);
    }

    if (body.step !== "debater") {
      return Response.json({ error: "Invalid step" }, { status: 400 });
    }

    const phase = body.phase ?? "initial";
    if (phase !== "initial" && phase !== "rebuttal") {
      return Response.json({ error: "Invalid phase" }, { status: 400 });
    }

    if (!body.modelId) {
      return Response.json({ error: "modelId is required" }, { status: 400 });
    }

    const result = await runCouncilDebaterStep(
      auth.userId,
      body.topic ?? "",
      mode,
      depth,
      phase,
      body.modelId,
      body.attachments ?? null,
      phase === "rebuttal" && Array.isArray(body.initial) ? body.initial : undefined,
    );
    if (!result.ok) {
      return Response.json({ error: result.reason }, { status: 422 });
    }

    return Response.json({ opinion: result.opinion });
  });
}
