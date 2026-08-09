"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import DisneyCompanion, {
  type DisneyMood,
} from "@/components/disney/DisneyCompanion";
import {
  DISNEY_CHARACTER_LIST,
  resolveDisneyCharacter,
  type DisneyCharacterId,
} from "@/lib/disney-characters";
import { disneyPanelClass } from "@/lib/disney-utils";
import type { DisneyChatMessage } from "@/lib/types/disney";
import type { DisneyParkKey } from "@/lib/types/disney";

const STARTER_PROMPTS = [
  "今から効率よく回る順番を教えて！",
  "このパークの隠れミッキー、どこにある？",
  "子連れ向けのおすすめを教えて！",
];

const IDLE_LINES: Record<DisneyCharacterId, string[]> = {
  mickey: [
    "ハハッ！ 今日はどこから回る？",
    "ぼくと一緒に、わくわくプランを考えよう！",
    "待ち時間も味方にできるよ。聞いてみて！",
  ],
  donald: [
    "クワッ！ ぼ、僕に任せてくれよ！",
    "ミッキーより先に答えられるぞ！",
    "なんだい、回り方の相談かい？",
  ],
  elsa: [
    "大丈夫。落ち着いて順番を整えましょう。",
    "光を浴びるように、無理のない計画を。",
    "私に聞いて。混雑の流れを見ます。",
  ],
  baymax: [
    "こんにちは。私はベイマックスです。",
    "心拍数は安定しています。質問をどうぞ。",
    "疲労リスクを下げる回り方を提案できます。",
  ],
};

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
  const [characterId, setCharacterId] = useState<DisneyCharacterId>("mickey");
  const [messages, setMessages] = useState<DisneyChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idleTick, setIdleTick] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  const character = resolveDisneyCharacter(characterId);

  const conversationKey = `${park}:${targetDate}:${characterId}`;
  const [syncedKey, setSyncedKey] = useState(conversationKey);
  if (syncedKey !== conversationKey) {
    setSyncedKey(conversationKey);
    setMessages([]);
    setError(null);
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  useEffect(() => {
    if (messages.length > 0 || sending) return;
    const id = window.setInterval(() => {
      setIdleTick((value) => value + 1);
    }, 4800);
    return () => window.clearInterval(id);
  }, [messages.length, sending, characterId]);

  const mood: DisneyMood = sending
    ? "thinking"
    : messages.some((message) => message.role === "assistant")
      ? "speaking"
      : "idle";

  const companionLine = useMemo(() => {
    if (sending) return character.greeting;
    if (messages.length === 0) {
      const lines = IDLE_LINES[characterId];
      return lines[idleTick % lines.length]!;
    }
    const last = messages[messages.length - 1];
    if (last?.role === "assistant") {
      if (characterId === "mickey") return "続きもハハッと聞いてね！";
      if (characterId === "donald") return "ほら、まだ聞きたいだろ！";
      if (characterId === "elsa") return "必要なら、もう少し深く見ましょう。";
      return "追加の症状…ではなく、質問をどうぞ。";
    }
    return "受け取ったよ。少し待ってね。";
  }, [sending, messages, characterId, character.greeting, idleTick]);

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
          character: characterId,
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
    <div
      className={`${disneyPanelClass} flex min-h-[24rem] flex-col p-5 lg:min-h-[32rem]`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">
            {character.nameJa}に聞く
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            {parkName} · {targetDate} —
            キャラクターごとの口調と生きた光で答えます
          </p>
        </div>
        <span className="rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-2 py-0.5 text-[10px] font-semibold text-fuchsia-200">
          {character.badge}
        </span>
      </div>

      <div className="mt-4 rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
        <DisneyCompanion
          characterId={characterId}
          mood={mood}
          line={companionLine}
          nameJa={character.nameJa}
        />
      </div>

      <div className="mt-3 flex items-center gap-2">
        <label htmlFor="disney-character" className="text-xs text-slate-500">
          キャラクター
        </label>
        <select
          id="disney-character"
          value={characterId}
          onChange={(e) => setCharacterId(e.target.value as DisneyCharacterId)}
          disabled={sending}
          className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white disabled:opacity-50"
        >
          {DISNEY_CHARACTER_LIST.map((c) => (
            <option key={c.id} value={c.id} className="bg-slate-900">
              {c.nameJa}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 flex-1 space-y-3 overflow-y-auto pr-1">
        {messages.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
            <p>
              {character.nameJa}に回り方・待ち時間・混雑対策を相談してみてね！
            </p>
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
                  {character.nameJa}
                </p>
              )}
              {msg.content}
            </div>
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
          placeholder={`${character.nameJa}に質問...`}
          maxLength={600}
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
