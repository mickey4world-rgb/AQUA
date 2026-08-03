import type { CouncilAttachment } from "@/lib/types/council";

const TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "json",
  "csv",
  "log",
  "yaml",
  "yml",
  "xml",
  "html",
  "htm",
  "ts",
  "tsx",
  "js",
  "jsx",
  "py",
  "sql",
]);

const MAX_FILES = 3;
const MAX_FILE_CHARS = 8_000;
const MAX_TOTAL_CHARS = 16_000;

export function normalizeAttachments(
  raw: unknown,
): { ok: true; attachments: CouncilAttachment[] } | { ok: false; reason: string } {
  if (raw == null) {
    return { ok: true, attachments: [] };
  }
  if (!Array.isArray(raw)) {
    return { ok: false, reason: "添付ファイルの形式が不正です。" };
  }
  if (raw.length > MAX_FILES) {
    return { ok: false, reason: `添付は最大 ${MAX_FILES} 件までです。` };
  }

  const attachments: CouncilAttachment[] = [];
  let totalChars = 0;

  for (const item of raw) {
    if (!item || typeof item !== "object") {
      return { ok: false, reason: "添付ファイルの形式が不正です。" };
    }
    const name = String((item as { name?: string }).name ?? "").trim();
    const content = String((item as { content?: string }).content ?? "");
    if (!name) {
      return { ok: false, reason: "添付ファイル名が空です。" };
    }
    const ext = name.includes(".") ? name.split(".").pop()?.toLowerCase() : "";
    if (!ext || !TEXT_EXTENSIONS.has(ext)) {
      return {
        ok: false,
        reason: `未対応のファイル形式です: ${name}（テキスト系のみ）`,
      };
    }
    if (content.length > MAX_FILE_CHARS) {
      return {
        ok: false,
        reason: `${name} が大きすぎます（${MAX_FILE_CHARS} 文字以内）。`,
      };
    }
    totalChars += content.length;
    if (totalChars > MAX_TOTAL_CHARS) {
      return {
        ok: false,
        reason: `添付ファイル合計が大きすぎます（${MAX_TOTAL_CHARS} 文字以内）。`,
      };
    }
    attachments.push({ name, content, charCount: content.length });
  }

  return { ok: true, attachments };
}

export function formatAttachmentsForPrompt(
  attachments: CouncilAttachment[],
  maxChars = MAX_TOTAL_CHARS,
): string {
  if (!attachments.length) return "";

  const lines = ["【添付資料】"];
  let used = 0;
  for (const file of attachments) {
    const header = `\n--- ${file.name} ---\n`;
    const budget = Math.min(file.content.length, maxChars - used - header.length);
    if (budget <= 0) break;
    const body =
      file.content.length > budget
        ? `${file.content.slice(0, budget)}…（省略）`
        : file.content;
    lines.push(header, body);
    used += header.length + body.length;
  }
  return lines.join("");
}
