"use client";

import { useMemo, useState } from "react";
import {
  NEWS_SEARCH_CATEGORIES,
  NEWS_SEARCH_CATEGORY_LABEL,
  type NewsSearchCategory,
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
  if (item.outlook.includes("AI解説は未生成")) return false;
  if (item.outlook.includes("今夜の解説生成")) return false;
  if (item.outlook.includes("「今すぐ再取得」で詳細化")) return false;
  if (item.deepDive === item.summary && item.explanation === item.summary) return false;
  return true;
}

type NewsSearchBrowseViewProps = {
  digest: NewsSearchDigest;
  /** コンパクト表示（SHOWCASE 埋め込み） */
  compact?: boolean;
  className?: string;
};

export default function NewsSearchBrowseView({
  digest,
  compact = false,
  className = "",
}: NewsSearchBrowseViewProps) {
  const [category, setCategory] = useState<NewsSearchCategory>(() => {
    const first = NEWS_SEARCH_CATEGORIES.find((c) => digest.categories[c].length > 0);
    return first ?? "ai";
  });
  const [selectedId, setSelectedId] = useState<string | null>(
    () => digest.categories[category]?.[0]?.id ?? null,
  );

  const items = useMemo(
    () => digest.categories[category] ?? [],
    [digest, category],
  );

  const selected: NewsSearchItem | null = useMemo(() => {
    if (!selectedId) return null;
    for (const c of NEWS_SEARCH_CATEGORIES) {
      const hit = digest.categories[c].find((item) => item.id === selectedId);
      if (hit) return hit;
    }
    return null;
  }, [digest, selectedId]);

  const statusLabel =
    digest.enrichmentStatus === "complete"
      ? "解説完了"
      : digest.enrichmentStatus === "partial"
        ? "一部解説"
        : digest.enrichmentStatus === "failed"
          ? "解説未完了"
          : "見出し中心";

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[10px] tracking-[0.18em] text-cyan-200/70 uppercase">
            Nightly digest · read-only
          </p>
          <p className="mt-1 text-xs text-slate-400 sm:text-sm">
            取得 {digest.fetchedAt.slice(0, 16).replace("T", " ")} · {digest.source} ·{" "}
            {statusLabel}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {NEWS_SEARCH_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => {
              setCategory(c);
              setSelectedId(digest.categories[c][0]?.id ?? null);
            }}
            className={`rounded-full border px-3 py-1.5 text-xs transition ${
              category === c
                ? "border-cyan-300/40 bg-cyan-300/15 text-cyan-50"
                : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
            }`}
          >
            {NEWS_SEARCH_CATEGORY_LABEL[c]}
            <span className="ml-1 text-slate-500">{digest.categories[c].length}</span>
          </button>
        ))}
      </div>

      <div
        className={`grid gap-3 ${
          compact ? "lg:grid-cols-[0.95fr_1.15fr]" : "lg:grid-cols-[1.05fr_1.2fr]"
        }`}
      >
        <section
          className={`space-y-2 overflow-y-auto rounded-2xl border border-white/10 bg-white/[0.03] p-2 ${
            compact ? "max-h-[22rem]" : "max-h-[36rem]"
          }`}
        >
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

        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
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
                </div>
                <h2 className="mt-3 text-base font-medium text-white sm:text-lg">
                  {selected.title}
                </h2>
              </div>
              <Block title="分かりやすい解説" body={selected.explanation} />
              <Block title="深堀" body={selected.deepDive} />
              <Block title="今後の予想" body={selected.outlook} />
              {!compact && (
                <Block title="官公庁・基盤への示唆" body={selected.govRelevance} />
              )}
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
      </div>
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
