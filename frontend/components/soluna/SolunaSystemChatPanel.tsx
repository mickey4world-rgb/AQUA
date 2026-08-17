"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SolunaCharacterAvatar from "@/components/soluna/SolunaCharacterAvatar";
import { SOLUNA_CHARACTER_META } from "@/lib/types/soluna";
import type {
  SolunaSystemMessage,
  SolunaSystemPersonalityState,
  SolunaSystemStateResponse,
} from "@/lib/types/soluna";

function MoodBar({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.round(value * 100);
  return (
    <div className="min-w-[7rem] flex-1">
      <div className="mb-1 flex justify-between text-[10px] text-slate-400">
        <span>{label}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function PersonalityPanel({ personality }: { personality: SolunaSystemPersonalityState }) {
  return (
    <div className="mt-3 grid gap-3 rounded-xl border border-violet-300/15 bg-black/20 p-3 sm:grid-cols-2">
      <div>
        <p className="text-[10px] tracking-[0.18em] text-amber-200/70 uppercase">ソル · 気分</p>
        <div className="mt-2 flex gap-3">
          <MoodBar label="happiness" value={personality.sol.mood.happiness} color="bg-amber-300" />
          <MoodBar label="energy" value={personality.sol.mood.energy} color="bg-orange-300" />
        </div>
        <p className="mt-2 text-[10px] text-slate-400">
          今週の関心事: {personality.sol.interests.join(" · ")}
        </p>
      </div>
      <div>
        <p className="text-[10px] tracking-[0.18em] text-indigo-200/70 uppercase">ルーナ · 気分</p>
        <div className="mt-2 flex gap-3">
          <MoodBar label="happiness" value={personality.luna.mood.happiness} color="bg-indigo-300" />
          <MoodBar label="energy" value={personality.luna.mood.energy} color="bg-violet-300" />
        </div>
        <p className="mt-2 text-[10px] text-slate-400">
          今週の関心事: {personality.luna.interests.join(" · ")}
        </p>
      </div>
      <div className="sm:col-span-2">
        <p className="text-[10px] tracking-[0.18em] text-slate-400 uppercase">2人の関係性スコア</p>
        <div className="mt-2 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-300 to-indigo-300"
              style={{ width: `${personality.pairIntimacy}%` }}
            />
          </div>
          <span className="font-mono text-xs text-violet-100">{personality.pairIntimacy}/100</span>
        </div>
      </div>
    </div>
  );
}

type SolunaSystemChatPanelProps = {
  embedded?: boolean;
};

export default function SolunaSystemChatPanel({ embedded = false }: SolunaSystemChatPanelProps) {
  const [state, setState] = useState<SolunaSystemStateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadState = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/soluna/system");
      const data = (await res.json()) as SolunaSystemStateResponse & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "システム会話の読み込みに失敗しました");
        return;
      }
      setState(data);
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state?.messages]);

  if (loading) {
    return (
      <div className={`text-center text-sm text-slate-400 ${embedded ? "py-12" : "rounded-2xl border border-white/10 bg-white/[0.03] p-8"}`}>
        システム会話を読み込んでいます…
      </div>
    );
  }

  if (error || !state) {
    return (
      <div className={`text-sm text-rose-100 ${embedded ? "py-6" : "rounded-2xl border border-rose-400/30 bg-rose-500/10 p-6"}`}>
        {error ?? "システム会話を読み込めませんでした。"}
      </div>
    );
  }

  const body = (
    <>
      <div className="relative">
        <p className="text-[10px] tracking-[0.28em] text-violet-200/70 uppercase">System Chat</p>
        <h3 className="mt-1 text-lg font-semibold text-white">ソル ↔ ルーナ（全員共通）</h3>
        <p className="mt-1 text-[11px] text-slate-400">
          毎朝9時 · Gemini でニュース収集 · 会話は Claude（ソル）+ OpenAI（ルーナ）
        </p>
        {state.briefing && (
          <p className="mt-2 rounded-xl border border-violet-300/15 bg-violet-400/10 px-3 py-2 text-xs leading-relaxed text-violet-50/90">
            📰 {state.briefing.summary}
          </p>
        )}
        <p className="mt-2 text-[10px] text-slate-500">
          キーワード: {state.keywords.join(" · ")}
          {state.lastRunAt ? ` · 最終実行 ${new Date(state.lastRunAt).toLocaleString("ja-JP")}` : ""}
        </p>
        {state.personality && <PersonalityPanel personality={state.personality} />}
        {state.recentEpisodes.length > 0 && (
          <div className="mt-3 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2">
            <p className="text-[10px] tracking-[0.18em] text-slate-400 uppercase">エピソード記憶</p>
            <ul className="mt-2 space-y-1 text-[11px] text-slate-300">
              {state.recentEpisodes.slice(0, 3).map((episode) => (
                <li key={episode.id}>
                  <span className="text-violet-200/80">{episode.highlight}</span>
                  <span className="text-slate-500"> — {episode.summary}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="relative mt-5 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        {state.messages.length === 0 && (
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-5 text-sm text-slate-300">
            まだシステム会話はありません。毎朝9時（JST）に自動実行されます。
            {!state.configured && (
              <p className="mt-2 text-xs text-amber-200/80">
                Claude と Azure OpenAI の両方が必要です。
              </p>
            )}
          </div>
        )}

        {state.messages.map((message: SolunaSystemMessage) => {
          if (message.role === "system") {
            return (
              <div key={message.id} className="flex justify-center">
                <p className="max-w-[92%] rounded-full border border-violet-300/20 bg-violet-400/10 px-4 py-1.5 text-center text-[11px] text-violet-100/90">
                  {message.content}
                </p>
              </div>
            );
          }

          const isSol = message.role === "sol";
          const meta = SOLUNA_CHARACTER_META[isSol ? "sol" : "luna"];

          return (
            <div key={message.id} className="flex min-w-0 items-start gap-2.5">
              <SolunaCharacterAvatar
                character={isSol ? "sol" : "luna"}
                stage={{ id: "system", label: "System", min: 0, max: 100 }}
                mood="idle"
                size="sm"
              />
              <div
                className={`min-w-0 flex-1 rounded-2xl border px-4 py-3 text-sm leading-relaxed ${
                  isSol
                    ? "border-amber-300/20 bg-amber-400/[0.07] text-amber-50"
                    : "border-indigo-300/20 bg-indigo-400/[0.07] text-indigo-50"
                }`}
              >
                <p className="mb-1 text-[10px] font-medium tracking-[0.18em] uppercase opacity-70">
                  {meta.nameJa}
                  {message.modelLabel ? (
                    <span className="ml-2 normal-case tracking-normal opacity-80">
                      · {message.modelLabel}
                    </span>
                  ) : null}
                </p>
                <p className="whitespace-pre-wrap break-words">{message.content}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </>
  );

  if (embedded) {
    return <div className="relative flex min-h-[30rem] flex-1 flex-col">{body}</div>;
  }

  return (
    <section className="relative flex min-h-[34rem] flex-col overflow-hidden rounded-2xl border border-violet-400/20 bg-violet-500/[0.04] p-5 backdrop-blur-md">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_90%_0%,rgba(129,140,248,0.14),transparent_45%),radial-gradient(ellipse_at_10%_0%,rgba(251,191,36,0.1),transparent_42%)]" />
      {body}
    </section>
  );
}
