"use client";

import { useEffect, useRef, useState } from "react";
import CouncilFollowUpChat from "@/components/council/CouncilFollowUpChat";
import CouncilModelRoster from "@/components/council/CouncilModelRoster";
import DebateTimeline from "@/components/council/DebateTimeline";
import {
  COUNCIL_ATTACHMENT_ACCEPT,
  COUNCIL_ATTACHMENT_MAX_BYTES,
  COUNCIL_ATTACHMENT_MAX_FILES,
} from "@/lib/council-utils";
import type {
  CouncilAttachment,
  CouncilConfigResponse,
  CouncilDebateResult,
  CouncilDepth,
  CouncilMode,
} from "@/lib/types/council";

const STARTER_TOPICS = [
  "副業を始めるべきか、本業に集中すべきか",
  "TDR はランドとシー、どちらを先に回るべき？",
  "Azure と AWS、個人プロジェクトならどちら？",
];

type PendingAttachment = {
  name: string;
  content: string;
  size: number;
};

export default function CouncilPanel() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [config, setConfig] = useState<CouncilConfigResponse | null>(null);
  const [mode, setMode] = useState<CouncilMode>("domestic");
  const [depth, setDepth] = useState<CouncilDepth>("compact");
  const [topic, setTopic] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CouncilDebateResult | null>(null);

  useEffect(() => {
    fetch("/api/council/config")
      .then((res) => res.json())
      .then((data) => setConfig(data as CouncilConfigResponse))
      .catch(() => setError("設定の読み込みに失敗しました"));
  }, []);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    setError(null);

    const next: PendingAttachment[] = [...attachments];
    for (const file of Array.from(fileList)) {
      if (next.length >= COUNCIL_ATTACHMENT_MAX_FILES) {
        setError(`添付は最大 ${COUNCIL_ATTACHMENT_MAX_FILES} 件までです。`);
        break;
      }
      if (file.size > COUNCIL_ATTACHMENT_MAX_BYTES) {
        setError(`${file.name} が大きすぎます（${Math.round(COUNCIL_ATTACHMENT_MAX_BYTES / 1024)}KB 以内）。`);
        continue;
      }
      const content = await file.text();
      next.push({ name: file.name, content, size: file.size });
    }
    setAttachments(next);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function submitTopic(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    if (!config?.azureConfigured) {
      setError("Azure OpenAI が未設定のため、AI 合議は利用できません。");
      return;
    }

    if (mode === "domestic" && !config.domestic.available) {
      setError(
        config.domestic.warning ??
          "国内限定モードは日本リージョンの Azure OpenAI が必要です。",
      );
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    const payloadAttachments: CouncilAttachment[] = attachments.map((a) => ({
      name: a.name,
      content: a.content,
      charCount: a.content.length,
    }));

    try {
      const res = await fetch("/api/council/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: trimmed,
          mode,
          depth,
          attachments: payloadAttachments,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "合議に失敗しました");
        return;
      }
      setResult(data as CouncilDebateResult);
      setTopic("");
      setAttachments([]);
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }

  const modeConfig = mode === "domestic" ? config?.domestic : config?.global;
  const depthLabel =
    depth === "compact" ? "簡潔（3回・節約）" : "標準（7回・詳細）";
  const azureBlocked = Boolean(config && !config.azureConfigured);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-md">
        <h2 className="text-sm font-semibold text-white">相談モード</h2>
        <p className="mt-1 text-xs text-slate-400">
          国内限定はプロンプト・添付データを日本リージョン Azure のみで処理。国内問わずは Azure 最新系デプロイ（GPT-5 等）。
        </p>

        {config && !config.azureConfigured && config.setupHint && (
          <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-xs text-amber-100">
            <p className="font-medium">Azure OpenAI 未設定</p>
            <p className="mt-1 opacity-90">{config.setupHint}</p>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {(["domestic", "global"] as const).map((key) => {
            const modeConfig = key === "domestic" ? config?.domestic : config?.global;
            const unavailable = Boolean(config && !modeConfig?.available);
            return (
              <button
                key={key}
                type="button"
                disabled={loading || unavailable}
                onClick={() => setMode(key)}
                className={`rounded-full px-4 py-2.5 text-sm font-medium transition disabled:opacity-40 ${
                  mode === key
                    ? "bg-gradient-to-r from-violet-500 to-emerald-500 text-white"
                    : "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                }`}
              >
                {key === "domestic" ? "🇯🇵 国内限定" : "🌐 国内問わず（最新）"}
              </button>
            );
          })}
        </div>

        <div className="mt-4">
          <p className="text-xs font-medium text-slate-300">合議の深さ</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(["compact", "standard"] as const).map((key) => (
              <button
                key={key}
                type="button"
                disabled={loading}
                onClick={() => setDepth(key)}
                className={`rounded-full px-3 py-2 text-xs font-medium transition disabled:opacity-50 ${
                  depth === key
                    ? "border border-emerald-400/40 bg-emerald-500/15 text-emerald-200"
                    : "border border-white/10 bg-white/5 text-slate-400 hover:bg-white/10"
                }`}
              >
                {key === "compact" ? "簡潔（推奨）" : "標準（詳細）"}
              </button>
            ))}
          </div>
        </div>

        {modeConfig && (
          <div className="mt-4 rounded-xl border border-white/5 bg-black/20 p-3 text-xs text-slate-400">
            <p>{modeConfig.description}</p>
            <p className="mt-2 text-slate-500">データ領域: {modeConfig.dataRegion}</p>
            {mode === "domestic" && config?.domestic.warning && (
              <p className="mt-2 text-amber-200/90">{config.domestic.warning}</p>
            )}
            {mode === "global" && config?.global.warning && (
              <p className="mt-2 text-amber-200/90">{config.global.warning}</p>
            )}
            <div className="mt-4">
              <CouncilModelRoster
                title="使用モデル（設定値）"
                models={modeConfig.models}
                judge={modeConfig.judge}
              />
            </div>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-md">
        <h2 className="text-sm font-semibold text-white">相談テーマ</h2>
        <p className="mt-1 text-xs text-slate-400">
          {depthLabel} — AI 呼び出し {depth === "compact" ? "3" : "7"} 回。テキストファイル添付可。
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

        <div className="mt-3">
          <input
            ref={fileInputRef}
            type="file"
            accept={COUNCIL_ATTACHMENT_ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <button
            type="button"
            disabled={loading || attachments.length >= COUNCIL_ATTACHMENT_MAX_FILES}
            onClick={() => fileInputRef.current?.click()}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/10 disabled:opacity-50"
          >
            📎 ファイルを添付（txt / md / json 等）
          </button>
          {attachments.length > 0 && (
            <ul className="mt-2 space-y-1">
              {attachments.map((file) => (
                <li
                  key={file.name}
                  className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-black/20 px-2 py-1 text-xs text-slate-400"
                >
                  <span>
                    {file.name} ({Math.round(file.size / 1024)}KB)
                  </span>
                  <button
                    type="button"
                    className="text-rose-300"
                    onClick={() =>
                      setAttachments((prev) => prev.filter((f) => f.name !== file.name))
                    }
                  >
                    削除
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

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
            placeholder="例: 添付の企画書を踏まえて優先順位をつけて"
            disabled={loading || azureBlocked}
            rows={3}
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={loading || azureBlocked || !topic.trim()}
            className="rounded-xl bg-gradient-to-r from-violet-500 to-emerald-500 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50 sm:self-end"
          >
            {loading ? "合議中..." : "AI 合議を開始"}
          </button>
        </form>

        {loading && (
          <div className="mt-4 space-y-2 text-xs text-slate-500">
            <p>① 各 AI が要点を述べています...</p>
            {depth === "standard" && <p>② AI 同士が議論しています...</p>}
            <p>{depth === "standard" ? "③" : "②"} 議長がまとめを作成しています...</p>
          </div>
        )}

        {error && <p className="mt-3 text-xs text-rose-300">{error}</p>}
      </div>

      {result && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-white">合議結果</h2>
            <span className="text-[10px] text-slate-500">
              {result.dataRegionNote} · {result.apiCalls} API calls
            </span>
          </div>
          <p className="mt-2 rounded-xl border border-white/5 bg-black/20 p-3 text-sm text-slate-300">
            {result.topic}
          </p>
          {result.attachments.length > 0 && (
            <p className="mt-2 text-xs text-slate-500">
              添付: {result.attachments.map((a) => a.name).join(", ")}
            </p>
          )}
          <div className="mt-4">
            <CouncilModelRoster
              title="実行時モデル"
              models={result.models}
              judge={result.judge}
            />
          </div>
          <div className="mt-5">
            <DebateTimeline
              initial={result.initial}
              rebuttal={result.rebuttal}
              synthesis={result.synthesis}
            />
          </div>
          <CouncilFollowUpChat debate={result} />
        </div>
      )}
    </div>
  );
}
