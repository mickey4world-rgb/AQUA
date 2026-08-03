import type { CouncilModelMeta } from "@/lib/types/council";

export function formatModelDisplay(meta: CouncilModelMeta): string {
  if (meta.provider === "openai") {
    return `OpenAI · ${meta.model ?? "—"}`;
  }
  return `Azure · ${meta.deployment ?? meta.model ?? "—"}`;
}

export const COUNCIL_ATTACHMENT_ACCEPT =
  ".txt,.md,.json,.csv,.log,.yaml,.yml,.xml,.html,.htm,.ts,.tsx,.js,.jsx,.py,.sql";

export const COUNCIL_ATTACHMENT_MAX_FILES = 3;
export const COUNCIL_ATTACHMENT_MAX_BYTES = 24_000;
