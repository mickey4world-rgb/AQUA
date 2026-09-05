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

function attentionTone(score: number): string {
  if (score >= 80) return "border-rose-300/30 bg-rose-300/10 text-rose-100";
  if (score >= 60) return "border-amber-300/30 bg-amber-300/10 text-amber-100";
  return "border-cyan-300/25 bg-cyan-300/10 text-cyan-100";
}

function isEnriched(item: NewsSearchItem): boolean {
  if (!item.outlook?.trim()) return false;
  if (item.outlook.includes("今夜の解説生成")) return false;
  if (item.outlook.includes("「今すぐ再取得」で詳細化")) return false;
  if (item.deepDive === item.summary && item.explanation === item.summary) return false;
  return true;
}

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
        setSelectedId(data.digest.categories[first][0]?.id ?? null);
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
    () => digest?.categories[category] ?? [],
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

  async function enrichAll() {
    if (enriching || !digest) return;
    setEnriching(true);
    setError(null);
    let latest = digest;
    try {
      for (let i = 0; i < NEWS_SEARCH_CATEGORIES.length; i += 1) {
        const c = NEWS_SEARCH_CATEGORIES[i];
        if ((latest.categories[c] ?? []).length === 0) continue;
        if ((latest.categories[c] ?? []).every((item) => isEnriched(item))) continue;

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
        };
        if (!res.ok || !data.digest) {
          setError(data.error ?? `${NEWS_SEARCH_CATEGORY_LABEL[c]} の解説に失敗しました。`);
          return;
        }
        latest = data.digest;
        setDigest(data.digest);
      }
      setEnrichProgress(null);
    } catch {
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
              ? `取得 ${digest.fetchedAt.slice(0, 16).replace("T", " ")} · ${digest.source}${digest.solunaSynced ? " · Soluna連携済" : ""}`
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
          いまは見出し一覧のみです。「AIで解説を生成」を押すと、カテゴリごとに深堀・今後の予想・官公庁向け示唆を作成します（合計1〜2分程度）。
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
                  setSelectedId(digest?.categories[c][0]?.id ?? null);
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
