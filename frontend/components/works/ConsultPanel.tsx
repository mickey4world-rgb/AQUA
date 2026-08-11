"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ConsultCompanion, {
  type ConsultMood,
} from "@/components/works/ConsultCompanion";
import {
  copyToClipboard,
  downloadMarkdown,
  worksPanelClass,
} from "@/lib/works-utils";
import {
  workNoteToMarkdown,
  type WorkNote,
  type WorkNoteDraft,
  type WorksChatMessage,
  type WorksConsultResponse,
} from "@/lib/types/works";
import type { ConsultVisualDocument } from "@/lib/types/consult-visual";

type ConsultPanelProps = {
  onNoteSaved: (note: WorkNote) => void;
  onVisualUpdate?: (payload: {
    visual: ConsultVisualDocument | null;
    reply: string | null;
    loading: boolean;
  }) => void;
};

const IDLE_LINES = [
  "今日は何を一緒に考える？",
  "ちょっとした疑問でも大丈夫だよ。",
  "ここに書いてくれたら、すぐ返事するね。",
];

export default function ConsultPanel({ onNoteSaved, onVisualUpdate }: ConsultPanelProps) {
  const [messages, setMessages] = useState<WorksChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [draft, setDraft] = useState<WorkNoteDraft | null>(null);
  const [idleTick, setIdleTick] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  useEffect(() => {
    if (messages.length > 0 || sending) return;
    const id = window.setInterval(() => {
      setIdleTick((value) => value + 1);
    }, 5200);
    return () => window.clearInterval(id);
  }, [messages.length, sending]);

  const mood: ConsultMood = sending || summarizing
    ? "thinking"
    : messages.some((message) => message.role === "assistant")
      ? "speaking"
      : "idle";

  const companionLine = useMemo(() => {
    if (sending) return "うん、少し考えてる…";
    if (summarizing) return "いま話をまとめているよ。";
    if (saving) return "メモに残しているね。";
    if (draft) return "まとめたよ。保存する？";
    if (messages.length === 0) return IDLE_LINES[idleTick % IDLE_LINES.length];
    const last = messages[messages.length - 1];
    if (last.role === "assistant") return "続きも聞いてね。";
    return "受け取ったよ。";
  }, [sending, summarizing, saving, draft, messages, idleTick]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setError(null);
    setNotice(null);
    setSending(true);
    setInput("");
    onVisualUpdate?.({ visual: null, reply: null, loading: true });

    const priorMessages = messages;
    const nextHistory: WorksChatMessage[] = [
      ...priorMessages,
      { role: "user", content: trimmed },
    ];
    setMessages(nextHistory);

    try {
      const res = await fetch("/api/works/consult", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          history: priorMessages,
          topic: "general",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "送信に失敗しました");
        setMessages(priorMessages);
        onVisualUpdate?.({ visual: null, reply: null, loading: false });
        return;
      }

      const payload = data as WorksConsultResponse;
      setModel(payload.model);
      setMessages([...nextHistory, { role: "assistant", content: payload.reply }]);
      onVisualUpdate?.({
        visual: payload.visual,
        reply: payload.reply,
        loading: false,
      });
    } catch {
      setError("通信エラーが発生しました");
      setMessages(priorMessages);
      onVisualUpdate?.({ visual: null, reply: null, loading: false });
    } finally {
      setSending(false);
    }
  }

  async function summarize() {
    if (summarizing || messages.length === 0) return;

    setError(null);
    setNotice(null);
    setSummarizing(true);

    try {
      const res = await fetch("/api/works/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history: messages, topic: "general" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "まとめに失敗しました");
        return;
      }
      setDraft(data.draft as WorkNoteDraft);
      if (data.model) setModel(data.model as string);
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setSummarizing(false);
    }
  }

  async function saveDraft() {
    if (!draft || saving) return;

    setError(null);
    setNotice(null);
    setSaving(true);

    try {
      const res = await fetch("/api/works/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft, topic: "general", model: model ?? "gemini" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "保存に失敗しました");
        return;
      }
      onNoteSaved(data.note as WorkNote);
      setDraft(null);
      setNotice("メモを保存しました。右の一覧からいつでも取り出せます。");
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setSaving(false);
    }
  }

  async function copyPrompt() {
    if (!draft) return;
    const ok = await copyToClipboard(draft.claudePrompt);
    setNotice(ok ? "Claude Code 用プロンプトをコピーしました。" : null);
    if (!ok) setError("クリップボードにコピーできませんでした");
  }

  function resetThread() {
    setMessages([]);
    setDraft(null);
    setError(null);
    setNotice(null);
    setInput("");
    onVisualUpdate?.({ visual: null, reply: null, loading: false });
  }

  return (
    <div className={`${worksPanelClass} relative flex min-h-[34rem] flex-col overflow-hidden p-5`}>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_0%,rgba(103,232,249,0.12),transparent_45%),radial-gradient(ellipse_at_90%_30%,rgba(167,139,250,0.08),transparent_40%)]" />

      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <ConsultCompanion mood={mood} line={companionLine} />
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-cyan-300/30 bg-cyan-400/10 px-2.5 py-0.5 text-[10px] font-medium text-cyan-100">
            Gemini
          </span>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={resetThread}
              className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-slate-400 hover:bg-white/5"
            >
              新しい相談
            </button>
          )}
        </div>
      </div>

      <div className="relative mt-5 max-h-[26rem] flex-1 space-y-3 overflow-y-auto pr-1">
        {messages.length === 0 && (
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-5">
            <p className="text-sm leading-relaxed text-slate-300">
              思いついたことをそのまま書いてね。短い一言でも大丈夫。
            </p>
          </div>
        )}

        {messages.map((message, index) => (
          <div
            key={`${index}-${message.role}`}
            className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[94%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                message.role === "user"
                  ? "whitespace-pre-wrap bg-gradient-to-r from-cyan-500/80 to-teal-500/80 text-white"
                  : "border border-cyan-300/15 bg-cyan-400/[0.06] text-slate-100"
              }`}
            >
              {message.role === "assistant" ? (
                <div className="space-y-2">
                  {message.content.split(/\n+/).filter(Boolean).map((line, lineIndex) => (
                    <p key={`${index}-${lineIndex}`}>{line.replace(/^[-*]\s*/, "• ")}</p>
                  ))}
                </div>
              ) : (
                message.content
              )}
            </div>
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      {error && (
        <p className="relative mt-3 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {error}
        </p>
      )}
      {notice && (
        <p className="relative mt-3 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
          {notice}
        </p>
      )}

      {draft && (
        <div className="relative mt-4 rounded-2xl border border-cyan-300/25 bg-cyan-400/[0.06] p-4">
          <p className="text-[10px] font-medium tracking-[0.2em] text-cyan-200/80 uppercase">
            まとめ
          </p>
          <h3 className="mt-2 text-sm font-semibold text-white">{draft.title}</h3>
          <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-300">
            {draft.summary}
          </p>

          {draft.steps.length > 0 && (
            <ol className="mt-3 space-y-1.5">
              {draft.steps.map((step, i) => (
                <li key={step} className="flex gap-2 text-xs text-slate-300">
                  <span className="font-mono text-cyan-300/80">{i + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          )}

          {draft.claudePrompt && (
            <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/30 p-3 font-mono text-[11px] leading-relaxed text-slate-300">
              {draft.claudePrompt}
            </pre>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={saveDraft}
              disabled={saving}
              className="rounded-xl bg-gradient-to-r from-cyan-300 to-teal-200 px-4 py-2 text-xs font-semibold text-slate-950 disabled:opacity-50"
            >
              {saving ? "保存中..." : "メモに保存"}
            </button>
            <button
              type="button"
              onClick={copyPrompt}
              className="rounded-xl border border-white/15 px-4 py-2 text-xs text-slate-200 hover:bg-white/5"
            >
              プロンプトをコピー
            </button>
            <button
              type="button"
              onClick={() => downloadMarkdown(draft, workNoteToMarkdown(draft))}
              className="rounded-xl border border-white/15 px-4 py-2 text-xs text-slate-200 hover:bg-white/5"
            >
              .md
            </button>
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="rounded-xl px-3 py-2 text-xs text-slate-500 hover:text-slate-300"
            >
              破棄
            </button>
          </div>
        </div>
      )}

      <form
        className="relative mt-4 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage(input);
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              sendMessage(input);
            }
          }}
          rows={2}
          maxLength={2000}
          disabled={sending}
          placeholder="相談したいことを書く（Enter で送信）"
          className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/5 px-3.5 py-3 text-sm text-white placeholder:text-slate-500 disabled:opacity-50"
        />
        <div className="flex gap-2 sm:flex-col sm:self-end">
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="flex-1 rounded-xl bg-gradient-to-r from-cyan-300 to-teal-200 px-5 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50 sm:flex-none"
          >
            送信
          </button>
          <button
            type="button"
            onClick={summarize}
            disabled={summarizing || messages.length === 0}
            className="flex-1 whitespace-nowrap rounded-xl border border-white/15 px-4 py-2.5 text-xs text-slate-200 hover:bg-white/5 disabled:opacity-40 sm:flex-none"
          >
            {summarizing ? "まとめ中..." : "まとめる"}
          </button>
        </div>
      </form>
    </div>
  );
}
