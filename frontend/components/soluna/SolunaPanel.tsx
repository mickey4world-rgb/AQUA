"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SolunaCharacterAvatar, {
  type SolunaAvatarMood,
} from "@/components/soluna/SolunaCharacterAvatar";
import SolunaCharacterCard from "@/components/soluna/SolunaCharacterCard";
import { useSolunaVoice } from "@/lib/soluna-voice";
import { getLatestExchange } from "@/lib/soluna-utils";
import {
  SOLUNA_CHARACTER_META,
  type SolunaChatResponse,
  type SolunaStateResponse,
} from "@/lib/types/soluna";

const STARTERS = [
  "今日の目標を一緒に整理したい",
  "少し疲れているから話を聞いてほしい",
  "最近うまくいったことを共有したい",
];

function characterMood(
  character: "sol" | "luna",
  sending: boolean,
  speakingAs: "sol" | "luna" | null,
): SolunaAvatarMood {
  if (sending) return "thinking";
  if (speakingAs === character) return "speaking";
  return "idle";
}

export default function SolunaPanel() {
  const [state, setState] = useState<SolunaStateResponse | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showShortcut, setShowShortcut] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const chatSeqRef = useRef(0);
  const loadSeqRef = useRef(0);
  const hasLoadedStateRef = useRef(false);

  const {
    voiceEnabled,
    setVoiceEnabled,
    listening,
    speakingAs,
    startListening,
    stopListening,
    speakLines,
    sttSupported,
    ttsSupported,
  } = useSolunaVoice();

  const loadState = useCallback(async () => {
    const seq = ++loadSeqRef.current;
    setLoading(true);
    try {
      const res = await fetch("/api/soluna/state");
      let data: unknown;
      try {
        data = await res.json();
      } catch {
        if (seq === loadSeqRef.current && !hasLoadedStateRef.current) {
          setError("通信エラーが発生しました");
        }
        return;
      }
      if (seq !== loadSeqRef.current) return;
      if (!res.ok) {
        if (!hasLoadedStateRef.current) {
          const message =
            typeof data === "object" &&
            data !== null &&
            "error" in data &&
            typeof (data as { error?: unknown }).error === "string"
              ? (data as { error: string }).error
              : "状態の読み込みに失敗しました";
          setError(message);
        }
        return;
      }
      hasLoadedStateRef.current = true;
      setState(data as SolunaStateResponse);
      setError(null);
    } catch {
      if (seq === loadSeqRef.current && !hasLoadedStateRef.current) {
        setError("通信エラーが発生しました");
      }
    } finally {
      if (seq === loadSeqRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  const displayMessages = useMemo(
    () => (state ? getLatestExchange(state.messages) : []),
    [state],
  );

  const hasOlderHistory =
    state != null && state.messages.length > displayMessages.length;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayMessages, sending]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending || !state) return;

    setSending(true);
    setError(null);
    setNotice(null);
    setInput("");

    const priorMessages = state.messages;
    const seq = ++chatSeqRef.current;
    let chatApplied = false;

    setState({
      ...state,
      messages: [
        ...priorMessages,
        {
          id: `local-user-${Date.now()}`,
          userId: state.profile.userId,
          role: "user",
          content: trimmed,
          createdAt: new Date().toISOString(),
        },
      ],
    });

    try {
      const res = await fetch("/api/soluna/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });

      let data: unknown;
      try {
        data = await res.json();
      } catch {
        setError(
          res.status === 504 || res.status === 408
            ? "応答がタイムアウトしました。もう一度お試しください。"
            : `通信エラーが発生しました（HTTP ${res.status}）`,
        );
        setState((prev) => (prev ? { ...prev, messages: priorMessages } : prev));
        return;
      }

      if (!res.ok) {
        const message =
          typeof data === "object" &&
          data !== null &&
          "error" in data &&
          typeof (data as { error?: unknown }).error === "string"
            ? (data as { error: string }).error
            : "送信に失敗しました";
        setError(message);
        setState((prev) => (prev ? { ...prev, messages: priorMessages } : prev));
        return;
      }

      if (seq !== chatSeqRef.current) return;

      const payload = data as SolunaChatResponse;
      if (!payload.messages || !payload.sol?.content || !payload.luna?.content) {
        setError("応答形式が不正です。もう一度お試しください。");
        setState((prev) => (prev ? { ...prev, messages: priorMessages } : prev));
        return;
      }

      const newMemories = payload.newMemories ?? [];

      if (payload.costMode && payload.costMode !== "normal" && payload.costReason) {
        setNotice(payload.costReason);
      }
      setState((prev) =>
        prev
          ? {
              ...prev,
              messages: payload.messages,
              profile: {
                ...prev.profile,
                solIntimacy: payload.solIntimacy,
                lunaIntimacy: payload.lunaIntimacy,
                solInteractions: prev.profile.solInteractions + 1,
                lunaInteractions: prev.profile.lunaInteractions + 1,
              },
              sol: {
                ...prev.sol,
                intimacy: payload.solIntimacy,
                stage: payload.solStage,
                interactions: prev.sol.interactions + 1,
                model: payload.sol.model,
                provider: payload.sol.provider,
                growthTier: payload.sol.growthTier,
                tierLevel: payload.sol.tierLevel,
                routeReason: payload.sol.modelLabel ?? payload.sol.routeReason,
                memories: [
                  ...newMemories.filter((m) => m.character === "sol"),
                  ...prev.sol.memories,
                ].slice(0, 24),
              },
              luna: {
                ...prev.luna,
                intimacy: payload.lunaIntimacy,
                stage: payload.lunaStage,
                interactions: prev.luna.interactions + 1,
                model: payload.luna.model,
                provider: payload.luna.provider,
                growthTier: payload.luna.growthTier,
                tierLevel: payload.luna.tierLevel,
                routeReason: payload.luna.modelLabel ?? payload.luna.routeReason,
                memories: [
                  ...newMemories.filter((m) => m.character === "luna"),
                  ...prev.luna.memories,
                ].slice(0, 24),
              },
              costMode: payload.costMode,
              costReason: payload.costReason,
            }
          : prev,
      );
      chatApplied = true;
      setError(null);

      try {
        speakLines([
          { label: "ソル", text: payload.sol.content, character: "sol" },
          { label: "ルーナ", text: payload.luna.content, character: "luna" },
        ]);
      } catch {
        /* 音声読み上げ失敗はチャット成功扱いのまま */
      }
    } catch (error) {
      if (seq !== chatSeqRef.current || chatApplied) return;
      console.error("[soluna] chat failed", error);
      setError("通信エラーが発生しました");
      setState((prev) => (prev ? { ...prev, messages: priorMessages } : prev));
    } finally {
      if (seq === chatSeqRef.current) {
        setSending(false);
      }
    }
  }

  function handleMicClick() {
    if (listening) {
      stopListening();
      return;
    }
    setError(null);
    void startListening(
      (text) => void sendMessage(text),
      (message) => setError(message),
    );
  }

  async function rotateToken() {
    try {
      const res = await fetch("/api/soluna/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rotate-token" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "トークン再発行に失敗しました");
        return;
      }
      setState((prev) =>
        prev ? { ...prev, shortcutToken: data.shortcutToken as string } : prev,
      );
      setNotice("Apple Watch 用トークンを再発行しました。");
    } catch {
      setError("トークン再発行に失敗しました");
    }
  }

  async function copyToken() {
    if (!state?.shortcutToken) return;
    try {
      await navigator.clipboard.writeText(state.shortcutToken);
      setNotice("ショートカット用トークンをコピーしました。");
    } catch {
      setError("クリップボードにコピーできませんでした");
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center text-sm text-slate-400">
        Soluna を起動しています…
      </div>
    );
  }

  if (!state) {
    return (
      <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-6 text-sm text-rose-100">
        {error ?? "Soluna を読み込めませんでした。"}
      </div>
    );
  }

  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://your-aqua-app";

  const solMood = characterMood("sol", sending, speakingAs);
  const lunaMood = characterMood("luna", sending, speakingAs);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <section className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <SolunaCharacterCard character={state.sol} mood={solMood} />
          <SolunaCharacterCard character={state.luna} mood={lunaMood} />
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <button
            type="button"
            onClick={() => setShowShortcut((value) => !value)}
            className="flex w-full items-center justify-between text-left"
          >
            <div>
              <p className="text-[10px] tracking-[0.22em] text-cyan-200/70 uppercase">
                Apple Watch
              </p>
              <h3 className="mt-1 text-sm font-semibold text-white">ショートカット連携</h3>
            </div>
            <span className="text-xs text-slate-400">{showShortcut ? "閉じる" : "設定"}</span>
          </button>

          {showShortcut && (
            <div className="mt-4 space-y-3 text-xs leading-relaxed text-slate-300">
              <p>
                ショートカットから <strong className="text-white">認証なし</strong> で Soluna
                を呼び出せます。2人（ソル・ルーナ）の返答を JSON で受け取ります。
              </p>
              <div className="rounded-xl border border-white/10 bg-black/30 p-3 font-mono text-[11px] text-slate-200">
                POST {origin}/api/soluna/shortcut/chat
              </div>
              <p>
                ヘッダー: <code className="text-cyan-200">X-Soluna-Token</code> または JSON
                の <code className="text-cyan-200">token</code>
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={copyToken}
                  className="rounded-full border border-white/12 px-3 py-1.5 text-[11px] text-slate-200 hover:bg-white/5"
                >
                  トークンをコピー
                </button>
                <button
                  type="button"
                  onClick={rotateToken}
                  className="rounded-full border border-cyan-300/25 bg-cyan-400/10 px-3 py-1.5 text-[11px] text-cyan-100"
                >
                  トークン再発行
                </button>
              </div>
              <p className="text-[10px] text-slate-500">
                ショートカット例: 「テキストを要求」→「URL の内容を取得」POST、本文{" "}
                <code>{`{"message":"{{入力}}","token":"..."}`}</code>
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="relative flex min-h-[34rem] flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-md">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_10%_0%,rgba(251,191,36,0.12),transparent_45%),radial-gradient(ellipse_at_90%_10%,rgba(129,140,248,0.12),transparent_42%)]" />

        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] tracking-[0.28em] text-slate-400 uppercase">Soluna Chat</p>
            <h3 className="mt-1 text-lg font-semibold text-white">2人が同時に答えます</h3>
            <p className="mt-1 text-[11px] text-slate-500">
              直近のやりとりのみ表示 · モデル自動切替 · 育つほど知能 Lv.UP
            </p>
            {state.costMode && state.costMode !== "normal" && state.costReason && (
              <p className="mt-1 text-[11px] text-amber-200/80">{state.costReason}</p>
            )}
          </div>

          {(sttSupported || ttsSupported) && (
            <div className="flex flex-wrap gap-2">
              {ttsSupported && (
                <button
                  type="button"
                  onClick={() => setVoiceEnabled((value) => !value)}
                  className={`rounded-full border px-3 py-1.5 text-[11px] transition ${
                    voiceEnabled
                      ? "border-amber-300/35 bg-amber-400/15 text-amber-100"
                      : "border-white/10 text-slate-300 hover:bg-white/5"
                  }`}
                >
                  {voiceEnabled ? "🔊 音声返答 ON" : "🔇 音声返答 OFF"}
                </button>
              )}
              {sttSupported && (
                <button
                  type="button"
                  disabled={sending}
                  onClick={handleMicClick}
                  className={`rounded-full border px-3 py-1.5 text-[11px] transition disabled:opacity-40 ${
                    listening
                      ? "border-rose-400/40 bg-rose-500/20 text-rose-100"
                      : "border-white/10 text-slate-300 hover:bg-white/5"
                  }`}
                >
                  {listening ? "⏹ 聞き取り中…" : "🎙 話す"}
                </button>
              )}
            </div>
          )}
        </div>

        {listening && (
          <p className="relative mt-3 rounded-xl border border-cyan-400/25 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100">
            マイクに向かって話してください…
          </p>
        )}

        <div className="relative mt-4 flex flex-wrap gap-2">
          {STARTERS.map((starter) => (
            <button
              key={starter}
              type="button"
              disabled={sending}
              onClick={() => void sendMessage(starter)}
              className="rounded-full border border-white/10 px-3 py-1.5 text-[11px] text-slate-200 hover:bg-white/5 disabled:opacity-40"
            >
              {starter}
            </button>
          ))}
        </div>

        <div className="relative mt-5 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          {displayMessages.length === 0 && (
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-5 text-sm text-slate-300">
              {SOLUNA_CHARACTER_META.sol.nameJa} と {SOLUNA_CHARACTER_META.luna.nameJa}{" "}
              に話しかけてみてください。育てていくほど親密度が上がり、姿も変わっていきます。
            </div>
          )}

          {hasOlderHistory && displayMessages.length > 0 && (
            <p className="text-center text-[10px] text-slate-500">
              前回のやりとりを表示中
            </p>
          )}

          {displayMessages.map((message) => {
            if (message.role === "user") {
              return (
                <div key={message.id} className="flex justify-end">
                  <div className="max-w-[92%] rounded-2xl bg-gradient-to-r from-slate-600/80 to-slate-500/70 px-4 py-2.5 text-sm text-white">
                    {message.content}
                  </div>
                </div>
              );
            }

            const isSol = message.role === "sol";
            const character = isSol ? state.sol : state.luna;
            const mood = isSol ? solMood : lunaMood;
            const modelBadge =
              message.modelLabel ??
              (message.provider && message.model
                ? `${message.provider === "gemini" ? "Gemini" : message.provider === "openai" ? "Azure OpenAI" : "Azure Claude"} · ${message.model}`
                : character.routeReason);

            return (
              <div key={message.id} className="flex min-w-0 items-start gap-2.5">
                <SolunaCharacterAvatar
                  character={character.character}
                  stage={character.stage}
                  mood={mood}
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
                    {isSol ? "ソル" : "ルーナ"} · {character.stage.label}
                    {modelBadge ? (
                      <span className="ml-2 normal-case tracking-normal opacity-80">
                        · {modelBadge}
                      </span>
                    ) : null}
                  </p>
                  <p className="whitespace-pre-wrap break-words">{message.content}</p>
                </div>
              </div>
            );
          })}

          {sending && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex items-center gap-2 rounded-2xl border border-amber-300/15 bg-amber-400/[0.05] px-4 py-3 text-xs text-amber-100/80">
                <SolunaCharacterAvatar
                  character="sol"
                  stage={state.sol.stage}
                  mood="thinking"
                  size="sm"
                />
                ソルが考えています…
              </div>
              <div className="flex items-center gap-2 rounded-2xl border border-indigo-300/15 bg-indigo-400/[0.05] px-4 py-3 text-xs text-indigo-100/80">
                <SolunaCharacterAvatar
                  character="luna"
                  stage={state.luna.stage}
                  mood="thinking"
                  size="sm"
                />
                ルーナが考えています…
              </div>
            </div>
          )}
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

        <form
          className="relative mt-4 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            void sendMessage(input);
          }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={2}
            maxLength={2000}
            disabled={sending}
            placeholder="Soluna に話しかける（🎙 ボタンで音声入力も可）"
            className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/5 px-3.5 py-3 text-sm text-white placeholder:text-slate-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="rounded-xl bg-gradient-to-r from-amber-300 via-orange-200 to-indigo-300 px-5 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50 sm:self-end"
          >
            {sending ? "返信中…" : "送信"}
          </button>
        </form>
      </section>
    </div>
  );
}
