"use client";

import { useEffect, useState } from "react";
import DebateTimeline from "@/components/council/DebateTimeline";
import type {
  CouncilConfigResponse,
  CouncilDebateResult,
  CouncilMode,
} from "@/lib/types/council";

const STARTER_TOPICS = [
  "副業を始めるべきか、本業に集中すべきか",
  "TDR はランドとシー、どちらを先に回るべき？",
  "Azure と AWS、個人プロジェクトならどちら？",
];

export default function CouncilPanel() {
  const [config, setConfig] = useState<CouncilConfigResponse | null>(null);
  const [mode, setMode] = useState<CouncilMode>("domestic");
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CouncilDebateResult | null>(null);

  useEffect(() => {
    fetch("/api/council/config")
      .then((res) => res.json())
      .then((data) => setConfig(data as CouncilConfigResponse))
      .catch(() => setError("設定の読み込みに失敗しました"));
  }, []);

  async function submitTopic(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/council/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: trimmed, mode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "合議に失敗しました");
        return;
      }
      setResult(data as CouncilDebateResult);
      setTopic("");
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  const modeConfig = mode === "domestic" ? config?.domestic : config?.global;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-md">
        <h2 className="text-sm font-semibold text-white">相談モード</h2>
        <p className="mt-1 text-xs text-slate-400">
          国内限定は日本リージョンのみ。国内問わずは最新モデル構成（海外 API 含む場合あり）。
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {(["domestic", "global"] as const).map((key) => (
            <button
              key={key}
              type="button"
              disabled={loading}
              onClick={() => setMode(key)}
              className={`rounded-full px-4 py-2.5 text-sm font-medium transition disabled:opacity-50 ${
                mode === key
                  ? "bg-gradient-to-r from-violet-500 to-emerald-500 text-white"
                  : "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
              }`}
            >
              {key === "domestic" ? "🇯🇵 国内限定" : "🌐 国内問わず（最新）"}
            </button>
          ))}
        </div>

        {modeConfig && (
          <div className="mt-4 rounded-xl border border-white/5 bg-black/20 p-3 text-xs text-slate-400">
            <p>{modeConfig.description}</p>
            <p className="mt-2 text-slate-500">データ領域: {modeConfig.dataRegion}</p>
            {mode === "global" && config?.global.warning && (
              <p className="mt-2 text-amber-200/90">{config.global.warning}</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {modeConfig.models.map((m) => (
                <span
                  key={m.id}
                  className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-slate-300"
                >
                  {m.label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-md">
        <h2 className="text-sm font-semibold text-white">相談テーマ</h2>
        <p className="mt-1 text-xs text-slate-400">
          3 つの AI が初見 → 議論 → 議長がまとめ、計 7 回の AI 呼び出しが走ります（トークン多め）。
        </p>

        {!result && !loading && (
          <div className="mt-3 flex flex-wrap gap-2">
            {STARTER_TOPICS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => setTopic(prompt)}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/10"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}

        <form
          className="mt-4 flex flex-col gap-3 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            submitTopic(topic);
          }}
        >
          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="例: 来週の TDR、混雑を避けつつ効率よく回るには？"
            disabled={loading}
            rows={3}
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || !topic.trim()}
            className="rounded-xl bg-gradient-to-r from-violet-500 to-emerald-500 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50 sm:self-end"
          >
            {loading ? "合議中..." : "AI 合議を開始"}
          </button>
        </form>

        {loading && (
          <div className="mt-4 space-y-2 text-xs text-slate-500">
            <p>① 各 AI が初見を述べています...</p>
            <p>② AI 同士が議論しています...</p>
            <p>③ 議長がまとめを作成しています...</p>
          </div>
        )}

        {error && <p className="mt-3 text-xs text-rose-300">{error}</p>}
      </div>

      {result && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-white">合議結果</h2>
            <span className="text-[10px] text-slate-500">{result.dataRegionNote}</span>
          </div>
          <p className="mt-2 rounded-xl border border-white/5 bg-black/20 p-3 text-sm text-slate-300">
            {result.topic}
          </p>
          <div className="mt-5">
            <DebateTimeline
              initial={result.initial}
              rebuttal={result.rebuttal}
              synthesis={result.synthesis}
            />
          </div>
        </div>
      )}
    </div>
  );
}
