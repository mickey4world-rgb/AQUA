"use client";

import { useEffect, useRef, useState } from "react";
import {
  copyToClipboard,
  downloadMarkdown,
  worksPanelClass,
} from "@/lib/works-utils";
import {
  WORKS_TOPICS,
  resolveWorksTopic,
  workNoteToMarkdown,
  type WorkNote,
  type WorkNoteDraft,
  type WorksChatMessage,
  type WorksTopicId,
} from "@/lib/types/works";

const STARTER_PROMPTS: Record<WorksTopicId, string[]> = {
  "claude-code": [
    "この AQUA に新しいアプリを追加する手順を教えて",
    "Cosmos DB のコンテナ設計を見直したい",
    "Claude Code に渡すプロンプトの粒度のコツは？",
  ],
  architecture: [
    "Azure Static Web Apps と App Service はどちらが向いている？",
    "Cosmos DB のパーティションキー設計を相談したい",
    "Next.js App Router のキャッシュ戦略を整理したい",
  ],
  ai: [
    "無料枠で使える LLM の使い分けを教えて",
    "トークンコストを半分にする方法は？",
    "RAG を個人開発で試すなら最小構成は？",
  ],
  general: [
    "TypeScript の型設計で気をつけることは？",
    "個人開発の CI/CD 最小構成を教えて",
    "セキュリティ対策の優先順位を整理したい",
  ],
};

type ConsultPanelProps = {
  onNoteSaved: (note: WorkNote) => void;
};

export default function ConsultPanel({ onNoteSaved }: ConsultPanelProps) {
  const [topicId, setTopicId] = useState<WorksTopicId>("claude-code");
  const [messages, setMessages] = useState<WorksChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [draft, setDraft] = useState<WorkNoteDraft | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const topic = resolveWorksTopic(topicId);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setError(null);
    setNotice(null);
    setSending(true);
    setInput("");

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
          topic: topicId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "送信に失敗しました");
        setMessages(priorMessages);
        return;
      }

      setModel(data.model as string);
      setMessages([...nextHistory, { role: "assistant", content: data.reply as string }]);
    } catch {
      setError("通信エラーが発生しました");
      setMessages(priorMessages);
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
        body: JSON.stringify({ history: messages, topic: topicId }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "まとめの生成に失敗しました");
        return;
      }

      setDraft(data.draft as WorkNoteDraft);
      setModel(data.model as string);
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
        body: JSON.stringify({ draft, topic: topicId, model: model ?? "gemini" }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? data.message ?? "保存に失敗しました");
        return;
      }

      onNoteSaved(data.note as WorkNote);
      setDraft(null);
      setNotice("メモを保存しました。下の一覧からいつでも取り出せます。");
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
  }

  return (
    <div className={`${worksPanelClass} flex min-h-[34rem] flex-col p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">AI 相談ボード</h2>
          <p className="mt-1 text-xs text-slate-400">{topic.hint}</p>
        </div>
        <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-200">
          Gemini 無料枠
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {WORKS_TOPICS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTopicId(item.id)}
            disabled={sending}
            className={`rounded-full border px-3 py-1.5 text-xs transition disabled:opacity-50 ${
              item.id === topicId
                ? "border-emerald-400/50 bg-emerald-500/15 font-medium text-emerald-100"
                : "border-white/10 text-slate-400 hover:bg-white/5"
            }`}
          >
            {item.label}
          </button>
        ))}
        {messages.length > 0 && (
          <button
            type="button"
            onClick={resetThread}
            className="ml-auto rounded-full border border-white/10 px-3 py-1.5 text-xs text-slate-400 hover:bg-white/5"
          >
            新しい相談
          </button>
        )}
      </div>

      <div className="mt-4 max-h-[26rem] flex-1 space-y-3 overflow-y-auto pr-1">
        {messages.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-4">
            <p className="text-sm text-slate-400">
              相談したいことを書いてください。方針・トレードオフ・具体的な実装手順まで返します。
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {STARTER_PROMPTS[topicId].map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => sendMessage(prompt)}
                  disabled={sending}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/10 disabled:opacity-50"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message, index) => (
          <div
            key={`${index}-${message.role}`}
            className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[94%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                message.role === "user"
                  ? "bg-gradient-to-r from-emerald-600/80 to-teal-600/80 text-white"
                  : "border border-white/10 bg-white/5 text-slate-200"
              }`}
            >
              {message.role === "assistant" && (
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300/80">
                  Gemini
                </p>
              )}
              {message.content}
            </div>
          </div>
        ))}

        {sending && <p className="text-xs text-slate-500">Gemini が考え中...</p>}
        <div ref={bottomRef} />
      </div>

      {error && (
        <p className="mt-3 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          {error}
        </p>
      )}
      {notice && (
        <p className="mt-3 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
          {notice}
        </p>
      )}

      {draft && (
        <div className="mt-4 rounded-2xl border border-emerald-400/25 bg-emerald-500/[0.06] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-emerald-300/80">
            保存前プレビュー
          </p>
          <h3 className="mt-2 text-sm font-semibold text-white">{draft.title}</h3>
          <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-300">
            {draft.summary}
          </p>

          {draft.steps.length > 0 && (
            <ol className="mt-3 space-y-1.5">
              {draft.steps.map((step, i) => (
                <li key={step} className="flex gap-2 text-xs text-slate-300">
                  <span className="font-mono text-emerald-400/80">{i + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          )}

          {draft.claudePrompt && (
            <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/40 p-3 font-mono text-[11px] leading-relaxed text-slate-300">
              {draft.claudePrompt}
            </pre>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={saveDraft}
              disabled={saving}
              className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 px-4 py-2 text-xs font-semibold text-emerald-950 disabled:opacity-50"
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
              .md をダウンロード
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
        className="mt-4 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage(input);
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              sendMessage(input);
            }
          }}
          rows={3}
          maxLength={2000}
          disabled={sending}
          placeholder="相談内容を入力（⌘/Ctrl + Enter で送信）"
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 disabled:opacity-50"
        />
        <div className="flex gap-2 sm:flex-col sm:self-end">
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="flex-1 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 px-5 py-2.5 text-sm font-semibold text-emerald-950 disabled:opacity-50 sm:flex-none"
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
