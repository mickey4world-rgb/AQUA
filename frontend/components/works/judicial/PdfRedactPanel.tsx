"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { worksPanelClass } from "@/lib/works-utils";
import {
  DEFAULT_REDACT_TERMS,
  PATTERN_PRESETS,
  type RedactPatternKey,
  type RedactResult,
  parseCustomTerms,
  redactPdf,
  suggestTermsFromPdf,
} from "@/lib/judicial/pdf-redact";

const TERMS_STORAGE_KEY = "works-pdf-redact-terms";
const PATTERNS_STORAGE_KEY = "works-pdf-redact-patterns";

const ALL_PATTERN_KEYS = Object.keys(PATTERN_PRESETS) as RedactPatternKey[];

function loadStoredTerms(): string {
  if (typeof window === "undefined") return DEFAULT_REDACT_TERMS;
  return localStorage.getItem(TERMS_STORAGE_KEY) ?? DEFAULT_REDACT_TERMS;
}

function loadStoredPatterns(): RedactPatternKey[] {
  if (typeof window === "undefined") {
    return ["email", "phone", "postal", "company"];
  }
  try {
    const raw = localStorage.getItem(PATTERNS_STORAGE_KEY);
    if (!raw) return ["email", "phone", "postal", "company"];
    const parsed = JSON.parse(raw) as RedactPatternKey[];
    return parsed.filter((key) => ALL_PATTERN_KEYS.includes(key));
  } catch {
    return ["email", "phone", "postal", "company"];
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function PdfRedactPanel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [sourceBytes, setSourceBytes] = useState<ArrayBuffer | null>(null);
  const [termsText, setTermsText] = useState(loadStoredTerms);
  const [patterns, setPatterns] = useState<RedactPatternKey[]>(loadStoredPatterns);
  const [processing, setProcessing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<RedactResult | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const customTerms = useMemo(() => parseCustomTerms(termsText), [termsText]);

  useEffect(() => {
    localStorage.setItem(TERMS_STORAGE_KEY, termsText);
  }, [termsText]);

  useEffect(() => {
    localStorage.setItem(PATTERNS_STORAGE_KEY, JSON.stringify(patterns));
  }, [patterns]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function handleFileChange(file: File | null) {
    setError(null);
    setNotice(null);
    setResult(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }

    if (!file) {
      setSourceFile(null);
      setSourceBytes(null);
      return;
    }

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("PDF ファイルのみアップロードできます。");
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      setError("25MB 以下の PDF に対応しています。");
      return;
    }

    const bytes = await file.arrayBuffer();
    setSourceFile(file);
    setSourceBytes(bytes);
    setNotice(`${file.name} を読み込みました（${formatFileSize(file.size)}）。ブラウザ内で処理します。`);
  }

  function togglePattern(key: RedactPatternKey) {
    setPatterns((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  }

  async function handleScanSuggestions() {
    if (!sourceBytes) {
      setError("先に PDF をアップロードしてください。");
      return;
    }

    setScanning(true);
    setError(null);
    try {
      const suggestions = await suggestTermsFromPdf(sourceBytes);
      if (suggestions.length === 0) {
        setNotice("自動検出できる語句は見つかりませんでした。手動で追記してください。");
        return;
      }

      const existing = new Set(customTerms);
      const fresh = suggestions.filter((item) => !existing.has(item));
      if (fresh.length === 0) {
        setNotice("検出語句はすでにリストに含まれています。");
        return;
      }

      const suffix = fresh.join("\n");
      setTermsText((current) => `${current.trimEnd()}\n${suffix}\n`);
      setNotice(`${fresh.length} 件の語句をリストに追加しました。`);
    } catch {
      setError("語句の自動検出に失敗しました。");
    } finally {
      setScanning(false);
    }
  }

  async function handleRedact() {
    if (!sourceBytes || !sourceFile) {
      setError("先に PDF をアップロードしてください。");
      return;
    }

    if (customTerms.length === 0 && patterns.length === 0) {
      setError("黒塗りする語句または自動検出パターンを1つ以上指定してください。");
      return;
    }

    setProcessing(true);
    setError(null);
    setNotice(null);

    try {
      const output = await redactPdf({
        fileBytes: sourceBytes,
        customTerms,
        patterns,
      });

      if (previewUrl) URL.revokeObjectURL(previewUrl);

      const blob = new Blob([new Uint8Array(output.pdfBytes)], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      setResult(output);

      if (output.matchCount === 0) {
        setNotice(
          "マスキング対象は見つかりませんでした。語句リストやパターンを見直してください。",
        );
      } else {
        setNotice(`${output.matchCount} 箇所を黒塗りしました。プレビューとダウンロードが利用できます。`);
      }
    } catch {
      setError("PDF のマスキング処理に失敗しました。別の PDF でお試しください。");
    } finally {
      setProcessing(false);
    }
  }

  function handleDownload() {
    if (!result || !sourceFile) return;
    const blob = new Blob([new Uint8Array(result.pdfBytes)], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const baseName = sourceFile.name.replace(/\.pdf$/i, "");
    anchor.href = url;
    anchor.download = `${baseName}-redacted.pdf`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <section className={`${worksPanelClass} p-5 sm:p-6`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-medium text-white">PDF アップロード</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
              アップロードした PDF はブラウザ内だけで処理します。サーバーへ送信されません。
            </p>
          </div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded-xl border border-violet-400/30 bg-violet-500/15 px-4 py-2 text-sm text-violet-100 transition hover:bg-violet-500/25"
          >
            PDF を選択
          </button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            void handleFileChange(file);
            event.target.value = "";
          }}
        />

        {sourceFile ? (
          <div className="mt-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-300">
            <p className="font-medium text-white">{sourceFile.name}</p>
            <p className="mt-1 text-slate-400">{formatFileSize(sourceFile.size)}</p>
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-slate-500">
            ここに PDF をドロップするか、上のボタンから選択してください
          </div>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <section className={`${worksPanelClass} p-5 sm:p-6`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-medium text-white">黒塗りする内容</h2>
              <p className="mt-2 text-sm text-slate-400">
                1行に1語句。企業名・住所・人名など、自由に追加・編集できます。
              </p>
            </div>
            <button
              type="button"
              disabled={!sourceBytes || scanning}
              onClick={() => void handleScanSuggestions()}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/5 disabled:opacity-40"
            >
              {scanning ? "検出中…" : "PDF から語句を検出"}
            </button>
          </div>

          <textarea
            value={termsText}
            onChange={(event) => setTermsText(event.target.value)}
            rows={14}
            spellCheck={false}
            className="mt-4 w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 font-mono text-sm leading-relaxed text-slate-200 outline-none transition focus:border-violet-400/40"
            placeholder={"山田太郎\n株式会社サンプル\n東京都千代田区丸の内1-1-1"}
          />

          <p className="mt-2 text-xs text-slate-500">
            登録語句: {customTerms.length} 件（# で始まる行はコメント）
          </p>

          <div className="mt-6 border-t border-white/10 pt-5">
            <h3 className="text-sm font-medium text-white">自動検出パターン</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {ALL_PATTERN_KEYS.map((key) => {
                const preset = PATTERN_PRESETS[key];
                const checked = patterns.includes(key);
                return (
                  <label
                    key={key}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 transition ${
                      checked
                        ? "border-violet-400/30 bg-violet-500/10"
                        : "border-white/10 bg-white/[0.02]"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => togglePattern(key)}
                      className="mt-1"
                    />
                    <span>
                      <span className="block text-sm text-white">{preset.label}</span>
                      <span className="mt-0.5 block text-xs text-slate-400">
                        {preset.description}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            disabled={!sourceBytes || processing}
            onClick={() => void handleRedact()}
            className="mt-6 w-full rounded-xl bg-violet-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-violet-400 disabled:opacity-40"
          >
            {processing ? "マスキング中…" : "黒塗り PDF を生成"}
          </button>
        </section>

        <section className={`${worksPanelClass} p-5 sm:p-6`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-medium text-white">プレビュー</h2>
              <p className="mt-2 text-sm text-slate-400">
                生成後にここで確認し、ダウンロードできます。
              </p>
            </div>
            {result ? (
              <button
                type="button"
                onClick={handleDownload}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-white/5"
              >
                ダウンロード
              </button>
            ) : null}
          </div>

          {result ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-center">
                <p className="text-[11px] text-slate-500">黒塗り箇所</p>
                <p className="mt-1 text-lg font-medium text-white">{result.matchCount}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-center">
                <p className="text-[11px] text-slate-500">ページ数</p>
                <p className="mt-1 text-lg font-medium text-white">{result.pageCount}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-center">
                <p className="text-[11px] text-slate-500">語句数</p>
                <p className="mt-1 text-lg font-medium text-white">{customTerms.length}</p>
              </div>
            </div>
          ) : null}

          <div className="mt-4 overflow-hidden rounded-xl border border-white/10 bg-black/30">
            {previewUrl ? (
              <iframe
                title="マスキング済み PDF プレビュー"
                src={previewUrl}
                className="h-[min(72vh,720px)] w-full bg-white"
              />
            ) : (
              <div className="flex h-[min(52vh,520px)] items-center justify-center px-6 text-center text-sm text-slate-500">
                黒塗り PDF を生成すると、ここにプレビューが表示されます
              </div>
            )}
          </div>
        </section>
      </div>

      {error ? (
        <p className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
