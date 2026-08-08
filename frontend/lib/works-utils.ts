import type { WorkNoteDraft } from "@/lib/types/works";

export const worksPanelClass =
  "rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-md";

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function slugifyFileName(title: string): string {
  const cleaned = title
    .replace(/[\\/:*?"<>|]/g, "")
    .trim()
    .slice(0, 50);
  return `${cleaned || "work-note"}.md`;
}

export function downloadMarkdown(draft: WorkNoteDraft, markdown: string): void {
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = slugifyFileName(draft.title);
  anchor.click();
  URL.revokeObjectURL(url);
}
