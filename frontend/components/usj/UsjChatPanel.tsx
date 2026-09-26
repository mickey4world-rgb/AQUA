"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import DisneyCompanion, {
  type DisneyMood,
} from "@/components/disney/DisneyCompanion";
import type { DisneyCharacterId } from "@/lib/disney-characters";
import {
  USJ_CHARACTER_LIST,
  resolveUsjCharacter,
  type UsjCharacterId,
} from "@/lib/usj-characters";
import { disneyPanelClass } from "@/lib/disney-utils";
import type { DisneyChatMessage } from "@/lib/types/disney";

const STARTER_PROMPTS = [
  "開園から効率よく回る順番を教えて！",
  "任天堂ワールドとハリー・ポッター、どっちを先に？",
  "子連れ向けのおすすめを教えて！",
];

const IDLE_LINES: Record<UsjCharacterId, string[]> = {
  minion: [
    "バナナ！ どこから回るのさ？",
    "ミリオーンにおまかせ！",
    "待ち時間もボクと一緒にチェックだよォ！",
  ],
  snoopy: [
    "スヌーピに聞いてみて。",
    "ゆっくり回ろう。いいはなしだね。",
    "休憩ルートも知ってるよ。",
  ],
  peach: [
    "大丈夫よ。ピーチーが考えますわ。",
    "任天堂エリアの回り方、得意ですの。",
    "優雅に、でも効率よく行きましょう。",
  ],
  kitty: [
    "キティ―に聞いてね！",
    "かわいく回るコース、考えちゃう！",
    "サンリオエリアも忘れないでね。",
  ],
};

const COMPANION_THEME: Record<UsjCharacterId, DisneyCharacterId> = {
  minion: "donald",
  snoopy: "baymax",
  peach: "elsa",
  kitty: "mickey",
};

type UsjChatPanelProps = {
  selectedDate: string;
};

export default function UsjChatPanel({ selectedDate }: UsjChatPanelProps) {
  const [characterId, setCharacterId] = useState<UsjCharacterId>("minion");
  const character = resolveUsjCharacter(characterId);
  const [messages, setMessages] = useState<DisneyChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mood, setMood] = useState<DisneyMood>("idle");
  const bottomRef = useRef<HTMLDivElement>(null);

  const idleLine = useMemo(() => {
    const lines = IDLE_LINES[characterId];
    return lines[Math.floor(Date.now() / 60_000) % lines.length]!;
  }, [characterId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError(null);
    setMood("thinking");
    const nextHistory = [
      ...messages,
      { role: "user" as const, content: trimmed },
    ];
    setMessages(nextHistory);
    setInput("");
    try {
      const res = await fetch("/api/usj/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          history: messages,
          character: characterId,
          date: selectedDate,
        }),
      });
      const data = (await res.json()) as { reply?: string; error?: string };
      if (!res.ok || !data.reply) {
        setError(data.error ?? "回答に失敗しました。");
        setMood("idle");
        return;
      }
      setMessages([
        ...nextHistory,
        { role: "assistant", content: data.reply },
      ]);
      setMood("speaking");
    } catch {
      setError("回答に失敗しました。");
      setMood("idle");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={`${disneyPanelClass} p-4 sm:p-5`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] tracking-[0.16em] text-fuchsia-200/70 uppercase">
            Character chat
          </p>
          <h2 className="mt-1 text-sm font-semibold text-white">
            USJ キャラクター相談
          </h2>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {USJ_CHARACTER_LIST.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setCharacterId(c.id);
                setMessages([]);
                setError(null);
                setMood("idle");
              }}
              className={`rounded-full px-3 py-1 text-[11px] transition ${
                characterId === c.id
                  ? "bg-fuchsia-400/25 text-fuchsia-50"
                  : "bg-white/5 text-slate-300 hover:bg-white/10"
              }`}
            >
              {c.nameJa}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <DisneyCompanion
          characterId={COMPANION_THEME[characterId]}
          mood={mood}
          nameJa={character.nameJa}
          line={sending ? character.greeting : idleLine}
        />
      </div>

      <div className="mt-4 space-y-2">
        <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-3">
          {messages.length === 0 && (
            <p className="text-sm text-slate-400">{character.greeting}</p>
          )}
          {messages.map((m, i) => (
            <p
              key={`${m.role}-${i}`}
              className={`text-sm leading-relaxed ${
                m.role === "user" ? "text-cyan-100" : "text-fuchsia-50"
              }`}
            >
              <span className="text-[10px] uppercase text-slate-500">
                {m.role === "user" ? "あなた" : character.nameJa}
              </span>
              <br />
              {m.content}
            </p>
          ))}
          <div ref={bottomRef} />
        </div>
        {error && <p className="text-xs text-rose-300">{error}</p>}
        <div className="flex flex-wrap gap-1.5">
          {STARTER_PROMPTS.map((p) => (
            <button
              key={p}
              type="button"
              disabled={sending}
              onClick={() => void send(p)}
              className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-300 hover:bg-white/10 disabled:opacity-50"
            >
              {p}
            </button>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`${character.nameJa}に質問…`}
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-fuchsia-300/40"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="rounded-xl bg-fuchsia-400/25 px-4 py-2 text-sm text-fuchsia-50 disabled:opacity-50"
          >
            {sending ? "…" : "送信"}
          </button>
        </form>
      </div>
    </div>
  );
}
