"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import NewsSearchBrowseView from "@/components/works/NewsSearchBrowseView";
import type { NewsSearchDigest } from "@/lib/types/works-news-search";

export default function NewsSearchShowcaseDemo() {
  const [digest, setDigest] = useState<NewsSearchDigest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/public/works-news-search");
        const data = (await res.json()) as {
          digest?: NewsSearchDigest;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !data.digest) {
          setError(data.error ?? "公開ダイジェストを読み込めませんでした。");
          setDigest(null);
          return;
        }
        setDigest(data.digest);
        setError(null);
      } catch {
        if (!cancelled) setError("公開ダイジェストの取得に失敗しました。");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="showcase-demo showcase-demo--news">
      <div className="showcase-demo__glow" aria-hidden />
      <div className="showcase-demo__frame overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-300/80">
              News Search
            </p>
            <p className="mt-0.5 text-sm text-slate-300">深夜バッチの解説付きダイジェスト</p>
            <p className="mt-1 text-[10px] text-slate-500">
              閲覧無料 · AI相談はログイン後
            </p>
          </div>
          <Link
            href="/news-search-preview"
            className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3 py-1 text-[10px] text-cyan-100 transition hover:bg-cyan-500/20"
          >
            無料で詳しく見る →
          </Link>
        </div>
        <div className="p-3 sm:p-4">
          {loading && <p className="text-sm text-slate-400">読み込み中…</p>}
          {!loading && error && (
            <p className="rounded-xl border border-amber-300/20 bg-amber-300/5 px-3 py-3 text-sm text-amber-100">
              {error}
            </p>
          )}
          {!loading && digest && <NewsSearchBrowseView digest={digest} compact />}
        </div>
      </div>
    </div>
  );
}
