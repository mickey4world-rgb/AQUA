export const DOCS_ATTACHMENT_ACCEPT =
  ".txt,.md,.json,.csv,.log,.yaml,.yml,.xml,.html,.htm";

export const DOCS_ATTACHMENT_MAX_FILES = 3;
export const DOCS_ATTACHMENT_MAX_BYTES = 24_000;

export const DOCS_MAX_SLIDES = 10;
export const DOCS_DEFAULT_SLIDES = 5;

export function sanitizeFileName(title: string): string {
  const base = title
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 40);
  return `${base || "proposal"}.pptx`;
}
