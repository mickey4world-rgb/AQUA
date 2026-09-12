"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  NEWS_SEARCH_CATEGORIES,
  NEWS_SEARCH_CATEGORY_LABEL,
  type NewsSearchCategory,
  type NewsSearchChatMessage,
  type NewsSearchDigest,
  type NewsSearchItem,
} from "@/lib/types/works-news-search";
import { sortNewsItemsByAttention } from "@/lib/works-news-search-sort";

function attentionTone(score: number): string {
  if (score >= 80) return "border-rose-300/30 bg-rose-300/10 text-rose-100";
  if (score >= 60) return "border-amber-300/30 bg-amber-300/10 text-amber-100";
  return "border-cyan-300/25 bg-cyan-300/10 text-cyan-100";
}

function isEnriched(item: NewsSearchItem): boolean {
  if (!item.outlook?.trim()) return false;
  if (item.outlook.includes("AI解説は未生成")) return false;
  if (item.outlook.includes("今夜の解説生成")) return false;
  if (item.outlook.includes("「今すぐ再取得」で詳細化")) return false;
  if (item.deepDive === item.summary && item.explanation === item.summary) return false;
  return true;
}

type EnrichRunLine = {
  category: NewsSearchCategory;
  ok: boolean;
  detail: string;
};

const ENRICHMENT_STATUS_LABEL = {
  pending: "解説待ち",
  partial: "一部のみ解説済",
  complete: "解説完了",
  failed: "解説失敗",
} as const;

export default function NewsSearchPanel() {
  const [digest, setDigest] = useState<NewsSearchDigest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<NewsSearchCategory>("ai");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<NewsSearchChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState<string | null>(null);
  const [lastEnrichRun, setLastEnrichRun] = useState<{
    at: string;
    lines: EnrichRunLine[];
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/works/news-search");
      const data = (await res.json()) as {
        ok?: boolean;
        digest?: NewsSearchDigest;
        error?: string;
      };
      if (!res.ok || !data.digest) {
        setDigest(null);
        setError(data.error ?? "ニュースの読み込みに失敗しました。");
        return;
      }
      setDigest(data.digest);
      const first = NEWS_SEARCH_CATEGORIES.find((c) => data.digest!.categories[c].length > 0);
      if (first) {
        setCategory(first);
        const list = sortNewsItemsByAttention(data.digest.categories[first] ?? []);
        setSelectedId(list[0]?.id ?? null);
      }
    } catch {
      setError("ニュースの読み込みに失敗しました。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const items = useMemo(
    () => sortNewsItemsByAttention(digest?.categories[category] ?? []),
    [digest, category],
  );

  const selected: NewsSearchItem | null = useMemo(() => {
    if (!digest || !selectedId) return null;
    for (const c of NEWS_SEARCH_CATEGORIES) {
      const hit = digest.categories[c].find((item) => item.id === selectedId);
      if (hit) return hit;
    }
    return null;
  }, [digest, selectedId]);

  const needsEnrichment = useMemo(() => {
    if (!digest) return false;
    return NEWS_SEARCH_CATEGORIES.some((c) =>
      digest.categories[c].some((item) => !isEnriched(item)),
    );
  }, [digest]);

  const pipelineSummary = useMemo(() => {
    if (!digest) return null;
    const rows = NEWS_SEARCH_CATEGORIES.map((c) => {
      const list = digest.categories[c] ?? [];
      const enriched = list.filter((item) => isEnriched(item)).length;
      return {
        category: c,
        label: NEWS_SEARCH_CATEGORY_LABEL[c],
        fetched: list.length,
        enriched,
        pending: Math.max(0, list.length - enriched),
      };
    });
    const totalFetched = rows.reduce((sum, r) => sum + r.fetched, 0);
    const totalEnriched = rows.reduce((sum, r) => sum + r.enriched, 0);
    const status =
      digest.enrichmentStatus ??
      (totalFetched === 0
        ? "pending"
        : totalEnriched === 0
          ? "pending"
          : totalEnriched < totalFetched
            ? "partial"
            : "complete");
    return {
      rows,
      totalFetched,
      totalEnriched,
      status,
      statusLabel: ENRICHMENT_STATUS_LABEL[status],
      usedFallback: digest.usedFallback === true,
      collectionErrors: digest.collectionErrors ?? [],
      enrichmentErrors: digest.enrichmentErrors ?? [],
      source: digest.source,
    };
  }, [digest]);

  async function enrichAll() {
    if (enriching || !digest) return;
    setEnriching(true);
    setError(null);
    let latest = digest;
    const lines: EnrichRunLine[] = [];
    try {
      for (let i = 0; i < NEWS_SEARCH_CATEGORIES.length; i += 1) {
        const c = NEWS_SEARCH_CATEGORIES[i];
        if ((latest.categories[c] ?? []).length === 0) {
          lines.push({
            category: c,
            ok: true,
            detail: "記事0件のためスキップ",
          });
          continue;
        }
        if ((latest.categories[c] ?? []).every((item) => isEnriched(item))) {
          lines.push({
            category: c,
            ok: true,
            detail: "既に解説済のためスキップ",
          });
          continue;
        }

        setEnrichProgress(
          `${NEWS_SEARCH_CATEGORY_LABEL[c]} を解説中… (${i + 1}/${NEWS_SEARCH_CATEGORIES.length})`,
        );
        const res = await fetch("/api/works/news-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "enrich", category: c }),
        });
        const data = (await res.json()) as {
          digest?: NewsSearchDigest;
          error?: string;
          enrichedCount?: number;
        };
        if (!res.ok || !data.digest) {
          const detail = data.error ?? "解説に失敗";
          lines.push({ category: c, ok: false, detail });
          setLastEnrichRun({ at: new Date().toISOString(), lines });
          setError(detail);
          if (data.digest) setDigest(data.digest);
          return;
        }
        latest = data.digest;
        setDigest(data.digest);
        lines.push({
          category: c,
          ok: true,
          detail: `解説 ${data.enrichedCount ?? (data.digest.categories[c] ?? []).length} 件`,
        });
      }
      const stillNeeds = NEWS_SEARCH_CATEGORIES.some((c) =>
        (latest.categories[c] ?? []).some((item) => !isEnriched(item)),
      );
      setLastEnrichRun({ at: new Date().toISOString(), lines });
      if (stillNeeds) {
        setError(
          "一部カテゴリの解説が未完了のままです。成功扱いせず再試行してください。",
        );
        return;
      }
      setEnrichProgress(null);
    } catch {
      setLastEnrichRun({ at: new Date().toISOString(), lines });
      setError("解説生成に失敗しました。しばらくして再試行してください。");
    } finally {
      setEnriching(false);
      setEnrichProgress(null);
    }
  }

  async function sendChat() {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setChatError(null);
    const nextHistory = [...messages, { role: "user" as const, content: text }];
    setMessages(nextHistory);
    setInput("");
    try {
      const res = await fetch("/api/works/news-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: messages,
          itemId: selectedId ?? undefined,
        }),
      });
      const data = (await res.json()) as { reply?: string; error?: string };
      if (!res.ok || !data.reply) {
        setChatError(data.error ?? "回答に失敗しました。");
        return;
      }
      setMessages([...nextHistory, { role: "assistant", content: data.reply }]);
    } catch {
      setChatError("回答に失敗しました。");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] tracking-[0.18em] text-cyan-200/70 uppercase">
            Nightly digest · multi-source
          </p>
          <p className="mt-1 text-sm text-slate-400">
            {digest
              ? `取得 ${digest.fetchedAt.slice(0, 16).replace("T", " ")} · ${digest.source} · 解説 ${digest.enrichmentStatus ?? (needsEnrichment ? "pending" : "complete")}${digest.solunaSynced ? " · Soluna連携済" : ""}`
              : "深夜に Google / Bing / 公的・専門フィードから集約します。"}
          </p>
          {enrichProgress && (
            <p className="mt-1 text-xs text-cyan-200/80">{enrichProgress}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => void enrichAll()}
          disabled={enriching || !digest}
          className="rounded-full border border-cyan-300/35 bg-cyan-300/15 px-4 py-2 text-xs text-cyan-50 transition hover:bg-cyan-300/25 disabled:opacity-50"
        >
          {enriching ? "解説生成中…" : needsEnrichment ? "AIで解説を生成" : "解説を再生成"}
        </button>
      </div>

      {needsEnrichment && digest && !enriching && (
        <div className="rounded-2xl border border-amber-300/25 bg-amber-300/5 px-4 py-3 text-sm text-amber-50">
          いまは見出し一覧のみ（解説未完了）です。「AIで解説を生成」でカテゴリごとに深堀・見通しを作ります。失敗時は成功扱いせずエラーを出します。深夜ジョブも同様に解説完了まで失敗扱いです。
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-rose-300/25 bg-rose-300/5 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">読み込み中…</p>
      ) : !digest ? (
        <div className="rounded-2xl border border-amber-300/20 bg-amber-300/5 p-4 text-sm text-amber-100">
          {error ?? "ニュースサーチ結果がまだありません。"}
          <p className="mt-2 text-xs text-amber-100/70">
            深夜ジョブ後に一覧が表示されます。
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {NEWS_SEARCH_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setCategory(c);
                  const list = sortNewsItemsByAttention(digest?.categories[c] ?? []);
                  setSelectedId(list[0]?.id ?? null);
                }}
                className={`rounded-full border px-3 py-1.5 text-xs transition ${
                  category === c
                    ? "border-cyan-300/40 bg-cyan-300/15 text-cyan-50"
                    : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                }`}
              >
                {NEWS_SEARCH_CATEGORY_LABEL[c]}
                <span className="ml-1 text-slate-500">
                  {digest?.categories[c].length ?? 0}
                </span>
              </button>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.05fr_1.2fr_0.95fr]">
            <section className="glass-panel max-h-[40rem] space-y-2 overflow-y-auto rounded-2xl p-3">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={`w-full rounded-xl border p-3 text-left transition ${
                    selectedId === item.id
                      ? "border-cyan-300/35 bg-cyan-300/10"
                      : "border-white/8 bg-white/[0.02] hover:bg-white/[0.04]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-white">{item.title}</p>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${attentionTone(item.attentionScore)}`}
                    >
                      注目 {item.attentionScore}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-400">
                    {item.summary}
                  </p>
                  {!isEnriched(item) && (
                    <p className="mt-1 text-[10px] text-amber-200/80">解説未生成</p>
                  )}
                </button>
              ))}
              {items.length === 0 && (
                <p className="p-3 text-sm text-slate-500">このカテゴリの記事がありません。</p>
              )}
            </section>

            <section className="glass-panel rounded-2xl p-5">
              {selected ? (
                <div className="space-y-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[10px] ${attentionTone(selected.attentionScore)}`}
                      >
                        注目指数 {selected.attentionScore}
                      </span>
                      <span className="text-[11px] text-slate-500">
                        {NEWS_SEARCH_CATEGORY_LABEL[selected.category]}
                      </span>
                      {!isEnriched(selected) && (
                        <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-2 py-0.5 text-[10px] text-amber-100">
                          解説未生成
                        </span>
                      )}
                    </div>
                    <h2 className="mt-3 text-lg font-medium text-white">{selected.title}</h2>
                  </div>
                  <Block title="分かりやすい解説" body={selected.explanation} />
                  <Block title="深堀" body={selected.deepDive} />
                  <Block title="今後の予想" body={selected.outlook} />
                  <Block title="官公庁・基盤への示唆" body={selected.govRelevance} />
                  <div>
                    <p className="text-[11px] tracking-wide text-slate-500 uppercase">情報元</p>
                    <ul className="mt-2 space-y-1">
                      {selected.sources.map((source) => (
                        <li key={`${source.name}-${source.url}`} className="text-sm text-slate-300">
                          {source.url ? (
                            <a
                              href={source.url}
                              target="_blank"
                              rel="noreferrer"
                              className="underline decoration-white/20 underline-offset-2 hover:text-white"
                            >
                              {source.name}
                            </a>
                          ) : (
                            source.name
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500">左のリストから記事を選んでください。</p>
              )}
            </section>

            <section className="glass-panel flex min-h-[28rem] flex-col rounded-2xl p-4">
              <p className="text-[11px] tracking-[0.16em] text-slate-500 uppercase">
                解説を踏まえた AI 相談
              </p>
              <p className="mt-1 text-xs text-slate-400">
                司法クラウド基盤・政府事業AI導入の観点でも答えます。選択中の記事＋本日ダイジェストが根拠です。
              </p>
              <div className="mt-3 flex-1 space-y-3 overflow-y-auto">
                {messages.length === 0 && (
                  <p className="text-sm text-slate-500">
                    例: 「このニュースは基盤調達にどう効く？」「5000事業の管理AIに活かせる点は？」
                  </p>
                )}
                {messages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={`rounded-xl px-3 py-2 text-sm leading-relaxed ${
                      message.role === "user"
                        ? "ml-6 bg-cyan-300/10 text-cyan-50"
                        : "mr-4 bg-white/5 text-slate-200"
                    }`}
                  >
                    {message.content}
                  </div>
                ))}
                {sending && <p className="text-xs text-slate-500">考えています…</p>}
                {chatError && <p className="text-xs text-rose-300">{chatError}</p>}
              </div>
              <div className="mt-3 flex gap-2">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void sendChat();
                    }
                  }}
                  placeholder="最新情報を踏まえて相談…"
                  className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300/40"
                />
                <button
                  type="button"
                  onClick={() => void sendChat()}
                  disabled={sending || !input.trim()}
                  className="rounded-xl border border-cyan-300/30 bg-cyan-300/15 px-3 py-2 text-sm text-cyan-50 disabled:opacity-40"
                >
                  送信
                </button>
              </div>
            </section>
          </div>

          {pipelineSummary && (
            <section className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-slate-300">
              <p className="text-[11px] tracking-[0.16em] text-slate-500 uppercase">
                取得・解説の結果サマリー
              </p>
              <p className="mt-2 text-slate-200">
                総合: {pipelineSummary.statusLabel}
                {" · "}
                記事 {pipelineSummary.totalEnriched}/{pipelineSummary.totalFetched}{" "}
                件解説済
                {" · "}
                ソース {pipelineSummary.source}
                {pipelineSummary.usedFallback ? " · 緊急フィード補完あり" : ""}
              </p>
              <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                {pipelineSummary.rows.map((row) => (
                  <li
                    key={row.category}
                    className="flex justify-between gap-3 text-xs sm:text-sm"
                  >
                    <span className="text-slate-400">{row.label}</span>
                    <span
                      className={
                        row.fetched === 0
                          ? "text-amber-200/90"
                          : row.pending > 0
                            ? "text-amber-100"
                            : "text-emerald-200/90"
                      }
                    >
                      {row.fetched === 0
                        ? "取得0件"
                        : row.pending > 0
                          ? `取得${row.fetched} · 解説${row.enriched} · 未${row.pending}`
                          : `取得${row.fetched} · 解説完了`}
                    </span>
                  </li>
                ))}
              </ul>
              {pipelineSummary.collectionErrors.length > 0 && (
                <div className="mt-3 border-t border-white/8 pt-3">
                  <p className="text-xs text-slate-500">フィード取得で失敗したもの（一部）</p>
                  <ul className="mt-1 space-y-0.5 text-xs text-rose-200/85">
                    {pipelineSummary.collectionErrors.slice(0, 5).map((err) => (
                      <li key={err} className="truncate">
                        {err}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {pipelineSummary.enrichmentErrors.length > 0 && (
                <div className="mt-3 border-t border-white/8 pt-3">
                  <p className="text-xs text-slate-500">解説で失敗したもの</p>
                  <ul className="mt-1 space-y-0.5 text-xs text-rose-200/85">
                    {pipelineSummary.enrichmentErrors.slice(0, 6).map((err) => (
                      <li key={err}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
              {lastEnrichRun && (
                <div className="mt-3 border-t border-white/8 pt-3">
                  <p className="text-xs text-slate-500">
                    直近の手動再実行{" "}
                    {lastEnrichRun.at.slice(0, 16).replace("T", " ")}
                  </p>
                  <ul className="mt-1 space-y-0.5 text-xs">
                    {lastEnrichRun.lines.map((line) => (
                      <li
                        key={`${line.category}-${line.detail}`}
                        className={line.ok ? "text-emerald-200/85" : "text-rose-200/90"}
                      >
                        {NEWS_SEARCH_CATEGORY_LABEL[line.category]}:{" "}
                        {line.ok ? "OK" : "失敗"} — {line.detail}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Block({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <p className="text-[11px] tracking-wide text-slate-500 uppercase">{title}</p>
      <p className="mt-1 text-sm leading-relaxed text-slate-200 whitespace-pre-wrap">{body}</p>
    </div>
  );
}
