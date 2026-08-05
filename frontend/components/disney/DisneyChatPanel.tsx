"use client";

import { useEffect, useRef, useState } from "react";
import { disneyPanelClass } from "@/lib/disney-utils";
import type { DisneyChatMessage } from "@/lib/types/disney";
import type { DisneyParkKey } from "@/lib/types/disney";

const STARTER_PROMPTS = [
  "今から効率よく回る順番を教えて！",
  "このパークの隠れミッキー、どこにある？",
  "子連れ向けのおすすめと豆知識を教えて！",
];

type DisneyChatPanelProps = {
  park: DisneyParkKey;
  targetDate: string;
  parkName: string;
};

export default function DisneyChatPanel({
  park,
  targetDate,
  parkName,
}: DisneyChatPanelProps) {
  const [messages, setMessages] = useState<DisneyChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages([]);
    setError(null);
  }, [park, targetDate]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setError(null);
    setSending(true);
    setInput("");

    const priorMessages = messages;
    const nextHistory: DisneyChatMessage[] = [
      ...priorMessages,
      { role: "user", content: trimmed },
    ];
    setMessages(nextHistory);

    try {
      const res = await fetch("/api/disney/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          park,
          date: targetDate,
          message: trimmed,
          history: priorMessages,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "送信に失敗しました");
        setMessages(priorMessages);
        return;
      }

      setMessages([
        ...nextHistory,
        { role: "assistant", content: data.reply as string },
      ]);
    } catch {
      setError("通信エラーが発生しました");
      setMessages(priorMessages);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={`${disneyPanelClass} flex min-h-[24rem] flex-col p-5 lg:min-h-[32rem]`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">ミッキーに聞く</h2>
          <p className="mt-1 text-xs text-slate-400">
            {parkName} · {targetDate} — 回り方の相談に加え、歴史・トリビア・隠れミッキーもミッキー口調で答えるよ！
          </p>
        </div>
        <span className="rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-2 py-0.5 text-[10px] font-semibold text-fuchsia-200">
          Mickey AI
        </span>
      </div>

      <div className="mt-4 flex-1 space-y-3 overflow-y-auto pr-1">
        {messages.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
            <p>回り方・待ち時間・混雑対策はもちろん、パークの歴史や隠れミッキーの話も聞いてみてね！</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {STARTER_PROMPTS.map((prompt) => (
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

        {messages.map((msg, index) => (
          <div
            key={`${index}-${msg.role}`}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[92%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === "user"
                  ? "bg-gradient-to-r from-fuchsia-600/80 to-sky-600/80 text-white"
                  : "border border-white/10 bg-white/5 text-slate-200"
              }`}
            >
              {msg.role === "assistant" && (
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-fuchsia-300/80">
                  ミッキー
                </p>
              )}
              {msg.content}
            </div>
          </div>
        ))}

        {sending && (
          <p className="text-xs text-slate-500">ハハッ！ ミッキーが考え中...</p>
        )}
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
          placeholder="例: 今から3時間で回るなら？"
          disabled={sending}
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={sending || !input.trim()}
          className="rounded-xl bg-gradient-to-r from-fuchsia-500 to-sky-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          送信
        </button>
      </form>
    </div>
  );
}
