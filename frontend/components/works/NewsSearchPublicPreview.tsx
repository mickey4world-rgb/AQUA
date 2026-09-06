"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppPageShell from "@/components/layout/AppPageShell";
import NewsSearchBrowseView from "@/components/works/NewsSearchBrowseView";
import type { NewsSearchDigest } from "@/lib/types/works-news-search";

export default function NewsSearchPublicPreview() {
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
          return;
        }
        setDigest(data.digest);
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
    <AppPageShell theme="works">
      <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <p className="text-[11px] tracking-[0.2em] text-cyan-200/70 uppercase">
          Free preview · WORKS
        </p>
        <h1 className="mt-3 text-2xl font-medium text-white sm:text-3xl">ニュースサーチ</h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-400">
          深夜バッチで集約した AI／システム開発／世界経済／官公庁のニュースと解説を無料公開しています。
          AI 相談チャットはログイン後の WORKS で利用できます。
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/sample#news-search"
            className="rounded-full border border-white/12 px-4 py-2 text-sm text-slate-300 transition hover:border-white/25 hover:bg-white/5"
          >
            SHOWCASE へ
          </Link>
          <Link
            href="/works/consult/news-search"
            className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-50 transition hover:bg-cyan-500/20"
          >
            ログイン後に AI 相談
          </Link>
        </div>

        <div className="mt-8 rounded-3xl border border-white/10 bg-black/20 p-4 sm:p-6">
          {loading && <p className="text-sm text-slate-400">読み込み中…</p>}
          {!loading && error && (
            <p className="rounded-2xl border border-amber-300/20 bg-amber-300/5 px-4 py-3 text-sm text-amber-100">
              {error}
            </p>
          )}
          {!loading && digest && <NewsSearchBrowseView digest={digest} />}
        </div>
      </main>
    </AppPageShell>
  );
}
