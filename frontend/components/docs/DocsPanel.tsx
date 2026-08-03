"use client";

import { useRef, useState } from "react";
import DocsSlidePreview from "@/components/docs/DocsSlidePreview";
import {
  DOCS_ATTACHMENT_ACCEPT,
  DOCS_ATTACHMENT_MAX_BYTES,
  DOCS_ATTACHMENT_MAX_FILES,
} from "@/lib/docs-utils";
import type {
  DocOutline,
  DocsAttachment,
  DocsChatMessage,
  DocsGenerateResponse,
} from "@/lib/types/docs";

const STARTER_PROMPTS = [
  "来年度DX推進の内部提案を5枚で",
  "業務効率化の提案資料、部長報告用",
  "新システム導入の概算提案を簡潔に",
];

type PendingAttachment = {
  name: string;
  content: string;
  size: number;
};

function downloadBase64Pptx(base64: string, fileName: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob(
    [bytes],
    {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    },
  );
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function DocsPanel() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<DocsChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [outline, setOutline] = useState<DocOutline | null>(null);
  const [pptxBase64, setPptxBase64] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("proposal.pptx");
  const [model, setModel] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    setError(null);

    const next: PendingAttachment[] = [...attachments];
    for (const file of Array.from(fileList)) {
      if (next.length >= DOCS_ATTACHMENT_MAX_FILES) {
        setError(`添付は最大 ${DOCS_ATTACHMENT_MAX_FILES} 件までです。`);
        break;
      }
      if (file.size > DOCS_ATTACHMENT_MAX_BYTES) {
        setError(
          `${file.name} が大きすぎます（${Math.round(DOCS_ATTACHMENT_MAX_BYTES / 1024)}KB 以内）。`,
        );
        continue;
      }
      const content = await file.text();
      next.push({ name: file.name, content, size: file.size });
    }
    setAttachments(next);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setError(null);
    setInput("");

    const priorMessages = messages;
    const nextHistory: DocsChatMessage[] = [
      ...priorMessages,
      { role: "user", content: trimmed },
    ];
    setMessages(nextHistory);

    const payloadAttachments: DocsAttachment[] = attachments.map((a) => ({
      name: a.name,
      content: a.content,
      charCount: a.content.length,
    }));

    try {
      const res = await fetch("/api/docs/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          history: priorMessages,
          outline,
          attachments: payloadAttachments.length ? payloadAttachments : undefined,
        }),
      });

      const data = (await res.json()) as DocsGenerateResponse & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "生成に失敗しました");
        setMessages(priorMessages);
        return;
      }

      setOutline(data.outline);
      setPptxBase64(data.pptxBase64);
      setFileName(data.fileName);
      setModel(data.model);
      setAttachments([]);
      setMessages([
        ...nextHistory,
        { role: "assistant", content: data.reply },
      ]);
      setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch {
      setError("通信エラーが発生しました");
      setMessages(priorMessages);
    } finally {
      setLoading(false);
    }
  }

  function handleDownload() {
    if (!pptxBase64) return;
    downloadBase64Pptx(pptxBase64, fileName);
  }

  function resetSession() {
    setMessages([]);
    setOutline(null);
    setPptxBase64(null);
    setFileName("proposal.pptx");
    setModel(null);
    setAttachments([]);
    setError(null);
    setInput("");
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-md">
        <h2 className="text-sm font-semibold text-white">資料生成チャット</h2>
        <p className="mt-1 text-xs text-slate-400">
          内部提案向け PowerPoint（約5枚）を生成。Azure OpenAI（日本）のみ使用。サーバー保存なし。
        </p>

        {!outline && !loading && (
          <div className="mt-3 flex flex-wrap gap-2">
            {STARTER_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => setInput(prompt)}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/10"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}

        {messages.length > 0 && (
          <div className="mt-4 max-h-48 space-y-2 overflow-y-auto rounded-xl border border-white/5 bg-black/20 p-3">
            {messages.map((msg, i) => (
              <div
                key={`${msg.role}-${i}`}
                className={`text-xs ${
                  msg.role === "user" ? "text-blue-200" : "text-slate-300"
                }`}
              >
                <span className="font-medium">
                  {msg.role === "user" ? "あなた" : "AQUA"}:
                </span>{" "}
                {msg.content}
              </div>
            ))}
            <div ref={chatBottomRef} />
          </div>
        )}

        <div className="mt-3">
          <input
            ref={fileInputRef}
            type="file"
            accept={DOCS_ATTACHMENT_ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <button
            type="button"
            disabled={loading || attachments.length >= DOCS_ATTACHMENT_MAX_FILES}
            onClick={() => fileInputRef.current?.click()}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/10 disabled:opacity-50"
          >
            📎 参考資料を添付（txt / md 等）
          </button>
          {attachments.length > 0 && (
            <ul className="mt-2 space-y-1">
              {attachments.map((file) => (
                <li
                  key={file.name}
                  className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-black/20 px-2 py-1 text-xs text-slate-400"
                >
                  <span>
                    {file.name} ({Math.round(file.size / 1024)}KB)
                  </span>
                  <button
                    type="button"
                    className="text-rose-300"
                    onClick={() =>
                      setAttachments((prev) => prev.filter((f) => f.name !== file.name))
                    }
                  >
                    削除
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <form
          className="mt-4 flex flex-col gap-3 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            submit(input);
          }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              outline
                ? "例: 予算スライドを追加して、トーンをもっと堅めに"
                : "例: 来年度DX推進の内部提案を5枚で"
            }
            disabled={loading}
            rows={3}
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 disabled:opacity-50"
          />
          <div className="flex flex-col gap-2 sm:self-end">
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="rounded-xl bg-gradient-to-r from-[#1B2A4A] to-[#2563EB] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {loading ? "生成中..." : outline ? "構成を更新" : "pptx を生成"}
            </button>
            {outline && (
              <button
                type="button"
                onClick={resetSession}
                className="rounded-xl border border-white/10 px-4 py-2 text-xs text-slate-400 hover:bg-white/5"
              >
                新規作成
              </button>
            )}
          </div>
        </form>

        {error && (
          <p className="mt-3 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </p>
        )}
      </div>

      {outline && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-white">生成結果</h2>
              {model && (
                <p className="mt-1 font-mono text-[10px] text-slate-500">Azure · {model}</p>
              )}
            </div>
            <button
              type="button"
              disabled={!pptxBase64}
              onClick={handleDownload}
              className="rounded-xl bg-gradient-to-r from-blue-600 to-sky-500 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              ⬇ {fileName} をダウンロード
            </button>
          </div>

          <div className="mt-5">
            <DocsSlidePreview outline={outline} />
          </div>
        </div>
      )}
    </div>
  );
}
