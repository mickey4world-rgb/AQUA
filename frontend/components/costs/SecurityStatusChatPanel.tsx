"use client";

import { useEffect, useRef, useState } from "react";
import { glassPanel as costsPanelClass } from "@/components/costs/security/SecurityVisuals";

type Turn = { role: "user" | "assistant"; content: string };

const STARTERS = [
  "いま危険な状態ですか？根拠も教えて",
  "Next.js と Hono は使っていますか？版は？",
  "今月の攻撃・遮断は何件で、中身は？",
  "世界で騒がれている危険で、この環境に関係あるものは？",
];

function formatJst(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  });
}

export default function SecurityStatusChatPanel({ month }: { month: string }) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{
    askedAt: string;
    model: string;
    stackSummary: string;
    triageAgeHours: number | null;
    blockedEvents: number;
  } | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/costs/security-chat")
      .then(async (res) =>
        res.ok ? ((await res.json()) as { configured?: boolean }) : null,
      )
      .then((body) => {
        if (!cancelled) setConfigured(body?.configured === true);
      })
      .catch(() => {
        if (!cancelled) setConfigured(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, busy]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setBusy(true);
    setError(null);
    const nextTurns = [...turns, { role: "user" as const, content: message }];
    setTurns(nextTurns);
    setDraft("");
    try {
      const res = await fetch("/api/costs/security-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          month,
          history: nextTurns.slice(0, -1).slice(-8),
        }),
      });
      const body = (await res.json().catch(() => null)) as {
        reply?: string;
        error?: string;
        model?: string;
        askedAt?: string;
        snapshot?: {
          stackSummary?: string;
          triageAgeHours?: number | null;
          blockedEvents?: number;
        };
      } | null;
      if (!res.ok || !body?.reply) {
        throw new Error(body?.error ?? "回答を取得できませんでした");
      }
      setTurns([...nextTurns, { role: "assistant", content: body.reply }]);
      setMeta({
        askedAt: body.askedAt ?? new Date().toISOString(),
        model: body.model ?? "—",
        stackSummary: body.snapshot?.stackSummary ?? "",
        triageAgeHours: body.snapshot?.triageAgeHours ?? null,
        blockedEvents: body.snapshot?.blockedEvents ?? 0,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "回答に失敗しました");
      setTurns(turns);
      setDraft(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`${costsPanelClass} overflow-hidden`}>
      <div className="border-b border-white/10 px-5 py-4">
        <p className="text-sm font-semibold text-white">セキュリティ状況チャット</p>
        <p className="mt-1 text-xs text-slate-400">
          質問するたびに、最新の日次診断・今月の防御記録・利用部品一覧を読み直して答えます（推測で埋めません）。
        </p>
        {configured === false && (
          <p className="mt-2 text-xs text-amber-200">
            Gemini が未設定のためチャットは使えません。
          </p>
        )}
        {meta && (
          <p className="mt-2 font-mono text-[10px] text-slate-500">
            直近回答 {formatJst(meta.askedAt)} · {meta.model}
            {meta.triageAgeHours != null
              ? ` · 診断 ${meta.triageAgeHours}時間前`
              : ""}
            {` · 今月遮断 ${meta.blockedEvents} 回`}
            {meta.stackSummary ? ` · ${meta.stackSummary}` : ""}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-white/5 px-4 py-3">
        {STARTERS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={busy || configured === false}
            onClick={() => void send(s)}
            className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] text-slate-300 hover:bg-white/[0.08] disabled:opacity-40"
          >
            {s}
          </button>
        ))}
      </div>

      <div className="max-h-[22rem] space-y-3 overflow-auto px-5 py-4">
        {turns.length === 0 && (
          <p className="text-sm text-slate-500">
            例: 「Hono は使っている？」「いま問題ありの脆弱性は？」
          </p>
        )}
        {turns.map((t, i) => (
          <div
            key={`${t.role}-${i}`}
            className={`rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
              t.role === "user"
                ? "ml-8 border border-cyan-400/25 bg-cyan-500/10 text-cyan-50"
                : "mr-4 border border-white/10 bg-white/[0.03] text-slate-200"
            }`}
          >
            {t.content}
          </div>
        ))}
        {busy && (
          <p className="text-xs text-slate-500">最新状況を読んで回答中…</p>
        )}
        <div ref={bottomRef} />
      </div>

      {error && (
        <p className="border-t border-rose-400/20 bg-rose-500/10 px-5 py-2 text-xs text-rose-100">
          {error}
        </p>
      )}

      <form
        className="flex gap-2 border-t border-white/10 px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={busy || configured === false}
          maxLength={800}
          placeholder="いまのセキュリティ状況を質問…"
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-cyan-400/40 focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || configured === false || !draft.trim()}
          className="rounded-xl border border-cyan-400/40 bg-cyan-500/20 px-4 py-2 text-sm font-medium text-cyan-50 disabled:opacity-40"
        >
          送信
        </button>
      </form>
    </div>
  );
}
