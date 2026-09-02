"use client";

import { useEffect, useState } from "react";
import { formatRedactError, renderPdfPageToCanvas } from "@/lib/judicial/pdf-redact";

type PdfRedactPreviewProps = {
  pdfBytes: Uint8Array;
  pageCount: number;
};

export default function PdfRedactPreview({ pdfBytes, pageCount }: PdfRedactPreviewProps) {
  const [pageNumber, setPageNumber] = useState(1);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    void (async () => {
      setLoading(true);
      setError(null);

      try {
        const canvas = await renderPdfPageToCanvas({
          pdfBytes,
          pageNumber,
          scale: 1.35,
        });
        if (cancelled) return;

        objectUrl = canvas.toDataURL("image/png");
        setImageUrl((prev) => {
          if (prev?.startsWith("data:")) return objectUrl;
          return objectUrl;
        });
      } catch (err) {
        if (!cancelled) setError(formatRedactError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdfBytes, pageNumber]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={pageNumber <= 1 || loading}
            onClick={() => setPageNumber((current) => Math.max(1, current - 1))}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-white/5 disabled:opacity-40"
          >
            前へ
          </button>
          <span className="text-xs text-slate-400">
            {pageNumber} / {pageCount}
          </span>
          <button
            type="button"
            disabled={pageNumber >= pageCount || loading}
            onClick={() => setPageNumber((current) => Math.min(pageCount, current + 1))}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-white/5 disabled:opacity-40"
          >
            次へ
          </button>
        </div>
        {loading ? <span className="text-xs text-slate-500">プレビュー描画中…</span> : null}
      </div>

      <div className="overflow-auto rounded-xl border border-white/10 bg-slate-100">
        {error ? (
          <div className="flex min-h-[320px] items-center justify-center px-6 text-center text-sm text-rose-700">
            {error}
          </div>
        ) : imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={`黒塗り PDF プレビュー ${pageNumber} ページ目`}
            className="mx-auto block h-auto w-full max-w-full"
          />
        ) : (
          <div className="flex min-h-[320px] items-center justify-center text-sm text-slate-500">
            プレビューを準備しています…
          </div>
        )}
      </div>
    </div>
  );
}
