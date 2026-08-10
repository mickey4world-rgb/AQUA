import type {
  CouncilConfigResponse,
  CouncilDepth,
  CouncilModelMeta,
  CouncilMode,
} from "@/lib/types/council";

export function formatModelDisplay(meta: CouncilModelMeta): string {
  if (meta.provider === "openai") {
    return `OpenAI · ${meta.model ?? "—"}`;
  }
  if (meta.provider === "gemini") {
    return `Gemini · ${meta.model ?? "—"}`;
  }
  return `Azure · ${meta.deployment ?? meta.model ?? "—"}`;
}

export const COUNCIL_ATTACHMENT_ACCEPT =
  ".txt,.md,.json,.csv,.log,.yaml,.yml,.xml,.html,.htm,.ts,.tsx,.js,.jsx,.py,.sql";

export const COUNCIL_ATTACHMENT_MAX_FILES = 3;
export const COUNCIL_ATTACHMENT_MAX_BYTES = 24_000;

export function councilDebatersForSession(
  config: CouncilConfigResponse,
  mode: CouncilMode,
  depth: CouncilDepth,
): CouncilModelMeta[] {
  const modeConfig = mode === "domestic" ? config.domestic : config.global;
  const depthConfig =
    config.depths?.[depth] ??
    (depth === "compact"
      ? { debaterIds: ["logic", "skeptic"] as const, includeRebuttal: false }
      : { debaterIds: ["logic", "creative", "skeptic"] as const, includeRebuttal: true });
  const debaterIds = depthConfig.debaterIds;

  const debaters = modeConfig.models.filter(
    (model) =>
      model.role &&
      (debaterIds as readonly string[]).includes(model.role),
  );

  if (mode === "global" && config.geminiConfigured) {
    const gemini = modeConfig.models.find((model) => model.role === "explorer");
    if (gemini && !debaters.some((model) => model.id === gemini.id)) {
      debaters.push(gemini);
    }
  }

  return debaters;
}
