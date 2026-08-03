"use client";

import { useEffect, useRef, useState } from "react";
import { inferApodAnalysis, spacePanelClass } from "@/lib/space-utils";
import type { ApodEntry, ApodAnalysis, SpaceChatMessage } from "@/lib/types/space";

const STARTER_QUESTIONS = [
  "この星雲の構成成分は何ですか？",
  "どの波長で観測されていますか？",
  "この画像から分かる天体物理的な意味は？",
];

type TelescopeTimelineTabProps = {
  onSelect?: (entry: ApodEntry) => void;
};

export default function TelescopeTimelineTab({ onSelect }: TelescopeTimelineTabProps) {
  const [entries, setEntries] = useState<ApodEntry[]>([]);
  const [selected, setSelected] = useState<ApodEntry | null>(null);
  const [analysis, setAnalysis] = useState<ApodAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<SpaceChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const [summaryJa, setSummaryJa] = useState<{ titleJa: string; explanationJa: string } | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const summaryCache = useRef<Map<string, { titleJa: string; explanationJa: string }>>(new Map());

  useEffect(() => {
    fetch("/api/space/apod?days=21")
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          return;
        }
        const list = data.entries as ApodEntry[];
        setEntries(list);
        if (list[0]) selectEntry(list[0]);
      })
      .catch(() => setError("APOD の読み込みに失敗しました"))
      .finally(() => setLoading(false));
  }, []);

  function selectEntry(entry: ApodEntry) {
    setSelected(entry);
    setAnalysis(inferApodAnalysis(entry.title, entry.explanation));
    setChatMessages([]);
    setChatError(null);
    setSummaryError(null);
    onSelect?.(entry);

    const cached = summaryCache.current.get(entry.date);
    if (cached) {
      setSummaryJa(cached);
      return;
    }

    setSummaryJa(null);
    setSummaryLoading(true);
    fetch("/api/space/apod/summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apod: entry }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setSummaryError(data.error);
          return;
        }
        const summary = {
          titleJa: data.titleJa as string,
          explanationJa: data.explanationJa as string,
        };
        summaryCache.current.set(entry.date, summary);
        setSummaryJa(summary);
      })
      .catch(() => setSummaryError("日本語解説の取得に失敗しました"))
      .finally(() => setSummaryLoading(false));
  }

  async function sendChat(text: string) {
    if (!selected || !text.trim() || chatSending) return;
    setChatSending(true);
    setChatError(null);
    setChatInput("");

    const prior = chatMessages;
    const next: SpaceChatMessage[] = [...prior, { role: "user", content: text.trim() }];
    setChatMessages(next);

    try {
      const res = await fetch("/api/space/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text.trim(),
          history: prior,
          apod: selected,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setChatError(data.error ?? "送信に失敗しました");
        setChatMessages(prior);
        return;
      }
      setChatMessages([...next, { role: "assistant", content: data.reply as string }]);
      setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch {
      setChatError("通信エラーが発生しました");
      setChatMessages(prior);
    } finally {
      setChatSending(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="lg:col-span-2">
        <div className={spacePanelClass}>
          <h2 className="text-sm font-semibold text-white">望遠鏡画像タイムライン</h2>
          <p className="mt-1 text-xs text-slate-400">NASA APOD — 直近21日分（画像のみ）</p>

          {loading && <p className="mt-4 text-sm text-slate-500">読み込み中...</p>}
          {error && (
            <p className="mt-4 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {error}
            </p>
          )}

          <ul className="mt-4 max-h-[520px] space-y-2 overflow-y-auto pr-1">
            {entries.map((entry) => (
              <li key={entry.date}>
                <button
                  type="button"
                  onClick={() => selectEntry(entry)}
                  className={`flex w-full gap-3 rounded-xl border p-2 text-left transition ${
                    selected?.date === entry.date
                      ? "border-indigo-400/40 bg-indigo-500/10"
                      : "border-white/5 bg-black/20 hover:bg-white/5"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={entry.url}
                    alt=""
                    className="h-14 w-20 shrink-0 rounded-lg object-cover"
                  />
                  <div className="min-w-0">
                    <p className="text-[10px] text-slate-500">{entry.date}</p>
                    <p className="truncate text-xs font-medium text-slate-200">{entry.title}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="space-y-6 lg:col-span-3">
        {selected && analysis && (
          <>
            <div className={spacePanelClass}>
              <p className="text-xs text-indigo-300/80">{selected.date}</p>
              <h2 className="mt-1 text-lg font-bold text-white">
                {summaryJa?.titleJa ?? selected.title}
              </h2>
              {selected.copyright && (
                <p className="mt-1 text-[10px] text-slate-500">© {selected.copyright}</p>
              )}

              <div className="mt-4 overflow-hidden rounded-xl border border-white/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={selected.hdurl ?? selected.url}
                  alt={selected.title}
                  className="max-h-[360px] w-full object-contain bg-black/40"
                />
              </div>

              <div className="mt-4">
                <h3 className="text-sm font-semibold text-white">日本語解説</h3>
                {summaryLoading && (
                  <p className="mt-2 text-sm text-slate-500">AI が日本語解説を生成中...</p>
                )}
                {summaryError && (
                  <p className="mt-2 text-xs text-rose-300">{summaryError}</p>
                )}
                {summaryJa && (
                  <p className="mt-2 text-sm leading-relaxed text-slate-200">
                    {summaryJa.explanationJa}
                  </p>
                )}
                {!summaryLoading && !summaryJa && !summaryError && (
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">
                    {selected.explanation.slice(0, 480)}
                    {selected.explanation.length > 480 ? "…" : ""}
                  </p>
                )}
              </div>

              <details className="mt-4 rounded-xl border border-white/5 bg-black/20 px-3 py-2">
                <summary className="cursor-pointer text-xs text-slate-500">
                  英語原文（NASA APOD）
                </summary>
                <p className="mt-2 text-xs leading-relaxed text-slate-500">{selected.explanation}</p>
              </details>
            </div>

            <div className={spacePanelClass}>
              <h3 className="text-sm font-semibold text-white">光・波長分析</h3>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {analysis.telescope && (
                  <span className="rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3 py-1 text-indigo-200">
                    🔭 {analysis.telescope}
                  </span>
                )}
                {analysis.objectType && (
                  <span className="rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-1 text-sky-200">
                    ✦ {analysis.objectType}
                  </span>
                )}
              </div>

              <div className="mt-4 space-y-2">
                {analysis.bands.map((band) => (
                  <div
                    key={band.id}
                    className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
                      band.detected
                        ? "border-white/10 bg-white/5"
                        : "border-white/5 bg-black/10 opacity-40"
                    }`}
                  >
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: band.color }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-slate-200">
                        {band.label}{" "}
                        <span className="font-normal text-slate-500">({band.range})</span>
                      </p>
                      {band.detected && band.note && (
                        <p className="text-[10px] text-slate-500">{band.note}</p>
                      )}
                    </div>
                    {band.detected && (
                      <span className="text-[10px] font-medium text-emerald-300">検出</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className={spacePanelClass}>
              <h3 className="text-sm font-semibold text-white">AI に質問</h3>
              <p className="mt-1 text-xs text-slate-400">
                構成成分・波長・天体の意味など（Azure OpenAI / 日本）
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                {STARTER_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    disabled={chatSending}
                    onClick={() => sendChat(q)}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 hover:bg-white/10 disabled:opacity-50"
                  >
                    {q}
                  </button>
                ))}
              </div>

              {chatMessages.length > 0 && (
                <div className="mt-4 max-h-48 space-y-2 overflow-y-auto rounded-xl border border-white/5 bg-black/20 p-3">
                  {chatMessages.map((msg, i) => (
                    <div
                      key={`${msg.role}-${i}`}
                      className={`text-xs ${
                        msg.role === "user" ? "text-indigo-200" : "text-slate-300"
                      }`}
                    >
                      <span className="font-medium">
                        {msg.role === "user" ? "あなた" : "AI"}:
                      </span>{" "}
                      {msg.content}
                    </div>
                  ))}
                  <div ref={chatBottomRef} />
                </div>
              )}

              <form
                className="mt-4 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  sendChat(chatInput);
                }}
              >
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  disabled={chatSending}
                  placeholder="例: この星雲の構成成分は？"
                  className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-500 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={chatSending || !chatInput.trim()}
                  className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {chatSending ? "…" : "送信"}
                </button>
              </form>

              {chatError && (
                <p className="mt-2 text-xs text-rose-300">{chatError}</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
