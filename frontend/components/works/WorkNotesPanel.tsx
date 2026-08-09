"use client";

import { useState } from "react";
import {
  copyToClipboard,
  downloadMarkdown,
  worksPanelClass,
} from "@/lib/works-utils";
import {
  resolveWorksTopic,
  workNoteToMarkdown,
  type WorkNote,
} from "@/lib/types/works";

type WorkNotesPanelProps = {
  notes: WorkNote[];
  loading: boolean;
  error: string | null;
  onDeleted: (id: string) => void;
};

export default function WorkNotesPanel({
  notes,
  loading,
  error,
  onDeleted,
}: WorkNotesPanelProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function copyPrompt(note: WorkNote) {
    const ok = await copyToClipboard(note.claudePrompt || workNoteToMarkdown(note));
    setCopiedId(ok ? note.id : null);
    if (ok) setTimeout(() => setCopiedId(null), 2000);
  }

  async function remove(note: WorkNote) {
    if (deletingId) return;
    const confirmed = window.confirm(`「${note.title}」を削除しますか？`);
    if (!confirmed) return;

    setDeletingId(note.id);
    try {
      const res = await fetch(`/api/works/notes/${note.id}`, { method: "DELETE" });
      if (res.ok) onDeleted(note.id);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className={`${worksPanelClass} p-5`}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-white">保存したまとめ</h2>
        <span className="font-mono text-[10px] text-slate-500">
          {notes.length} note{notes.length === 1 ? "" : "s"}
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-400">
        いつでも見返して、不要ならすぐ削除できます。
      </p>

      {error && (
        <p className="mt-3 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          {error}
        </p>
      )}

      {loading && <p className="mt-4 text-xs text-slate-500">読み込み中...</p>}

      {!loading && notes.length === 0 && !error && (
        <p className="mt-4 rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-3 py-4 text-xs text-slate-500">
          まだメモがありません。相談後に「まとめる」→「メモに保存」で追加されます。
        </p>
      )}

      <ul className="mt-4 space-y-3">
        {notes.map((note) => {
          const open = openId === note.id;
          return (
            <li
              key={note.id}
              className="rounded-xl border border-white/10 bg-black/20 p-3.5"
            >
              <div className="flex items-start gap-2">
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : note.id)}
                  className="min-w-0 flex-1 text-left"
                  aria-expanded={open}
                >
                  <p className="truncate text-sm font-medium text-white">{note.title}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">
                    {resolveWorksTopic(note.topic).label} ·{" "}
                    {new Date(note.createdAt).toLocaleDateString("ja-JP")}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => remove(note)}
                  disabled={deletingId === note.id}
                  className="shrink-0 rounded-lg border border-rose-400/20 bg-rose-500/10 px-2.5 py-1.5 text-[11px] text-rose-200 transition hover:bg-rose-500/20 disabled:opacity-50"
                >
                  {deletingId === note.id ? "削除中" : "削除"}
                </button>
              </div>

              {note.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {note.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded border border-emerald-400/20 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-200"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {open && (
                <div className="mt-3 border-t border-white/10 pt-3">
                  <p className="whitespace-pre-wrap text-xs leading-relaxed text-slate-300">
                    {note.summary}
                  </p>

                  {note.steps.length > 0 && (
                    <ol className="mt-3 space-y-1.5">
                      {note.steps.map((step, i) => (
                        <li key={step} className="flex gap-2 text-xs text-slate-400">
                          <span className="font-mono text-emerald-400/70">{i + 1}.</span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                  )}

                  {note.claudePrompt && (
                    <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-slate-300">
                      {note.claudePrompt}
                    </pre>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => copyPrompt(note)}
                      className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-[11px] text-emerald-100 hover:bg-emerald-500/20"
                    >
                      {copiedId === note.id ? "コピーしました" : "プロンプトをコピー"}
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadMarkdown(note, workNoteToMarkdown(note))}
                      className="rounded-lg border border-white/15 px-3 py-1.5 text-[11px] text-slate-300 hover:bg-white/5"
                    >
                      .md
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
