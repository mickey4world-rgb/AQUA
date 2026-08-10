"use client";

import { useRef, useState } from "react";
import { readApiJson } from "@/lib/fetch-api";
import type {
  CouncilAttachment,
  CouncilChatMessage,
  CouncilDebateResult,
} from "@/lib/types/council";

type CouncilFollowUpChatProps = {
  debate: CouncilDebateResult;
  disabled?: boolean;
};

export default function CouncilFollowUpChat({ debate, disabled }: CouncilFollowUpChatProps) {
  const [messages, setMessages] = useState<CouncilChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending || disabled) return;

    setSending(true);
    setError(null);
    setInput("");

    const prior = messages;
    const nextUser: CouncilChatMessage = { role: "user", content: trimmed };
    setMessages([...prior, nextUser]);

    try {
      const res = await fetch("/api/council/followup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          debate,
          history: prior,
          attachments: debate.attachments,
        }),
      });
      const parsed = await readApiJson<{ reply: string; model: string }>(res);
      if (!parsed.ok) {
        setError(parsed.error);
        setMessages(prior);
        return;
      }
      setMessages([
        ...prior,
        nextUser,
        {
          role: "assistant",
          content: parsed.data.reply,
          modelUsed: parsed.data.model,
        },
      ]);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch {
      setError("通信エラーが発生しました");
      setMessages(prior);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mt-6 border-t border-white/10 pt-5">
      <h3 className="text-sm font-semibold text-white">合議後の追加質問</h3>
      <p className="mt-1 text-xs text-slate-400">
        まとめを踏まえて議長 AI に追加質問できます（1 回あたり 1 API 呼び出し）。
      </p>

      <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
        {messages.length === 0 && (
          <p className="text-xs text-slate-500">例: 「もっと具体的な手順を教えて」</p>
        )}
        {messages.map((msg, index) => (
          <div
            key={`${index}-${msg.role}`}
            className={`rounded-xl px-3 py-2 text-sm ${
              msg.role === "user"
                ? "ml-8 bg-violet-500/20 text-violet-100"
                : "mr-8 border border-white/10 bg-white/5 text-slate-200"
            }`}
          >
            {msg.role === "assistant" && msg.modelUsed && (
              <p className="mb-1 font-mono text-[10px] text-violet-300/80">{msg.modelUsed}</p>
            )}
            <p className="whitespace-pre-wrap">{msg.content}</p>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {error && <p className="mt-2 text-xs text-rose-300">{error}</p>}

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage(input);
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="追加で聞きたいこと..."
          disabled={sending || disabled}
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={sending || disabled || !input.trim()}
          className="rounded-xl border border-violet-400/30 bg-violet-500/20 px-4 py-2 text-sm font-medium text-violet-100 disabled:opacity-50"
        >
          送信
        </button>
      </form>
    </div>
  );
}
