"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  SolunaImageAsset,
  SolunaImageGenerateResponse,
  SolunaImageListResponse,
  SolunaImageModelId,
  SolunaImageModelOption,
} from "@/lib/types/soluna-image";

type StudioMessage = {
  id: string;
  role: "user" | "sol" | "luna" | "system";
  content: string;
  imageUrl?: string;
};

const STARTERS = [
  "冒険の朝、城の前で並んで手を振るソルとルーナ",
  "夜の星空の下で本を読むルーナと、盾を磨くソル",
  "雨上がりの虹の下、2人のちびアイコン風ポートレート",
];

const FALLBACK_MODELS: SolunaImageModelOption[] = [
  {
    id: "nanobanana-2",
    label: "Nano Banana 2",
    description: "ベース立ち絵と同じモデル（推奨）",
    styleFriendly: true,
    supportsReference: true,
  },
  {
    id: "nanobanana-2-lite",
    label: "Nano Banana 2 Lite",
    description: "同系統・やや軽量",
    styleFriendly: true,
    supportsReference: true,
  },
  { id: "flux", label: "Flux", description: "高品質（画風は寄りにくい）" },
  {
    id: "gptimage",
    label: "GPT Image",
    description: "イラスト寄り・参照対応",
    styleFriendly: true,
    supportsReference: true,
  },
  { id: "turbo", label: "Turbo", description: "高速・軽め" },
  { id: "sana", label: "Sana", description: "軽量・安定" },
  { id: "zimage", label: "Z-Image", description: "速い 6B 系" },
  {
    id: "klein",
    label: "Klein",
    description: "高速・参照対応",
    supportsReference: true,
  },
];

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("ファイルの読み込みに失敗しました"));
    reader.readAsDataURL(file);
  });
}

function extFromMime(mime: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  return "jpg";
}

async function downloadImage(url: string, filename: string) {
  if (url.startsWith("data:")) {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error("ダウンロードに失敗しました");
  const blob = await res.blob();
  const obj = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = obj;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(obj);
}

function safeFilename(title: string, mime: string): string {
  const base = title.replace(/[\\/:*?"<>|]+/g, "_").trim().slice(0, 40) || "soluna";
  return `${base}.${extFromMime(mime)}`;
}

export default function SolunaImageStudioPanel() {
  const [images, setImages] = useState<SolunaImageAsset[]>([]);
  const [meta, setMeta] = useState<Pick<
    SolunaImageListResponse,
    "baseImageUrl" | "generateConfigured" | "generateProvider" | "maxImages" | "models" | "defaultModel"
  > | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<SolunaImageModelId>("nanobanana-2");
  const [matchBaseStyle, setMatchBaseStyle] = useState(true);
  const [messages, setMessages] = useState<StudioMessage[]>([
    {
      id: "welcome",
      role: "system",
      content:
        "Nano Banana 2 は Google AI Studio と同系統の Gemini 直叩きを優先します。依頼は日本語のまま渡し、ON 時はベース立ち絵を参照して画風を寄せます。",
    },
  ]);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const models = meta?.models?.length ? meta.models : FALLBACK_MODELS;

  const loadImages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/soluna/images");
      const data = (await res.json()) as SolunaImageListResponse & { error?: string };
      if (!res.ok) {
        setError(data.error || "画像一覧の取得に失敗しました");
        return;
      }
      setImages(data.images ?? []);
      setMeta({
        baseImageUrl: data.baseImageUrl,
        generateConfigured: data.generateConfigured,
        generateProvider: data.generateProvider,
        maxImages: data.maxImages,
        models: data.models ?? FALLBACK_MODELS,
        defaultModel: data.defaultModel ?? "nanobanana-2",
      });
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadImages();
  }, [loadImages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function handleGenerate(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    setPrompt("");
    setMessages((prev) => [
      ...prev,
      {
        id: `u-${Date.now()}`,
        role: "user",
        content: `${trimmed}\n（${models.find((m) => m.id === model)?.label ?? model}${matchBaseStyle ? " · ベース画風" : ""}）`,
      },
    ]);

    try {
      const res = await fetch("/api/soluna/images/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmed, model, matchBaseStyle }),
      });
      const data = (await res.json()) as SolunaImageGenerateResponse & { error?: string };
      if (!res.ok) {
        setError(data.error || "画像生成に失敗しました");
        setMessages((prev) => [
          ...prev,
          {
            id: `e-${Date.now()}`,
            role: "system",
            content: data.error || "画像生成に失敗しました",
          },
        ]);
        return;
      }

      setMessages((prev) => [
        ...prev,
        { id: `sol-${Date.now()}`, role: "sol", content: data.solComment },
        { id: `luna-${Date.now()}`, role: "luna", content: data.lunaComment },
        {
          id: `img-${Date.now()}`,
          role: "system",
          content: `生成完了（${data.provider}）`,
          imageUrl: data.image.imageUrl,
        },
      ]);
      await loadImages();
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpload(file: File | null) {
    if (!file || busy) return;
    if (!file.type.startsWith("image/")) {
      setError("画像ファイルを選んでください");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const dataUrl = await fileToDataUrl(file);
      const res = await fetch("/api/soluna/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: file.name.replace(/\.[^.]+$/, "") || "アップロード画像",
          dataUrl,
        }),
      });
      const data = (await res.json()) as { image?: SolunaImageAsset; error?: string };
      if (!res.ok) {
        setError(data.error || "アップロードに失敗しました");
        return;
      }
      setMessages((prev) => [
        ...prev,
        {
          id: `up-${Date.now()}`,
          role: "system",
          content: "画像を保管しました",
          imageUrl: data.image?.imageUrl,
        },
      ]);
      await loadImages();
    } catch (err) {
      setError(err instanceof Error ? err.message : "アップロードに失敗しました");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleDelete(id: string) {
    if (busy) return;
    if (!window.confirm("この画像を削除しますか？")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/soluna/images/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || "削除に失敗しました");
        return;
      }
      await loadImages();
    } catch {
      setError("削除に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function handleDownload(img: Pick<SolunaImageAsset, "imageUrl" | "title" | "mimeType">) {
    try {
      await downloadImage(img.imageUrl, safeFilename(img.title, img.mimeType || "image/jpeg"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "ダウンロードに失敗しました");
    }
  }

  return (
    <div className="relative flex min-h-[34rem] flex-col gap-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_0%,rgba(34,211,238,0.1),transparent_45%),radial-gradient(ellipse_at_80%_10%,rgba(167,139,250,0.12),transparent_42%)]" />

      <div className="relative">
        <p className="text-[10px] tracking-[0.28em] text-cyan-200/80 uppercase">Image Studio</p>
        <h3 className="mt-1 text-lg font-semibold text-white">画像生成・保管</h3>
        <p className="mt-1 text-[12px] text-slate-400">
          ベース立ち絵を登録済み。生成は無料枠（{meta?.generateProvider ?? "Pollinations"}）を優先します。
          保管上限 {meta?.maxImages ?? 24} 枚。
        </p>
      </div>

      <div className="relative grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        {/* チャット生成 */}
        <div className="flex min-h-[28rem] flex-col rounded-2xl border border-white/10 bg-black/20 p-4">
          <p className="text-[11px] font-medium text-cyan-100">生成チャット</p>

          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="flex min-w-[10rem] flex-1 flex-col gap-1">
              <span className="text-[10px] text-slate-400">モデル</span>
              <select
                value={model}
                disabled={busy}
                onChange={(e) => setModel(e.target.value as SolunaImageModelId)}
                className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-[13px] text-white disabled:opacity-50"
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                    {m.styleFriendly ? " ★" : ""} — {m.description}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-[12px] text-slate-200">
              <input
                type="checkbox"
                checked={matchBaseStyle}
                disabled={busy}
                onChange={(e) => setMatchBaseStyle(e.target.checked)}
                className="accent-cyan-400"
              />
              ベース画風に合わせる
              {models.find((m) => m.id === model)?.supportsReference ? "（参照画像あり）" : ""}
            </label>
          </div>

          <div className="mt-3 flex-1 space-y-3 overflow-y-auto pr-1" style={{ maxHeight: "20rem" }}>
            {messages.map((m) => (
              <div
                key={m.id}
                className={`rounded-xl px-3 py-2 text-[13px] leading-relaxed ${
                  m.role === "user"
                    ? "ml-6 bg-white/10 text-slate-100"
                    : m.role === "sol"
                      ? "mr-4 border border-amber-300/20 bg-amber-500/10 text-amber-50"
                      : m.role === "luna"
                        ? "mr-4 border border-indigo-300/20 bg-indigo-500/10 text-indigo-50"
                        : "border border-white/10 bg-white/[0.04] text-slate-300"
                }`}
              >
                {m.role === "sol" && <p className="mb-1 text-[10px] text-amber-200/80">⚔️ ソル</p>}
                {m.role === "luna" && <p className="mb-1 text-[10px] text-indigo-200/80">📖 ルーナ</p>}
                <p className="whitespace-pre-wrap">{m.content}</p>
                {m.imageUrl && (
                  <div className="mt-2 space-y-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={m.imageUrl}
                      alt="generated"
                      className="max-h-56 w-auto rounded-lg border border-white/10"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        void handleDownload({
                          imageUrl: m.imageUrl!,
                          title: `soluna-${m.id}`,
                          mimeType: "image/jpeg",
                        })
                      }
                      className="text-[11px] text-cyan-200/90 underline"
                    >
                      ダウンロード
                    </button>
                  </div>
                )}
              </div>
            ))}
            {busy && (
              <p className="text-[12px] text-cyan-200/80">生成中…（無料APIのため数十秒かかることがあります）</p>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {STARTERS.map((s) => (
              <button
                key={s}
                type="button"
                disabled={busy}
                onClick={() => void handleGenerate(s)}
                className="rounded-full border border-white/10 px-3 py-1 text-[11px] text-slate-300 hover:bg-white/5 disabled:opacity-50"
              >
                {s.slice(0, 18)}…
              </button>
            ))}
          </div>

          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void handleGenerate(prompt);
            }}
          >
            <input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={busy}
              placeholder="例: 冬の城で並ぶソルとルーナのちび絵"
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-[13px] text-white placeholder:text-slate-500"
            />
            <button
              type="submit"
              disabled={busy || !prompt.trim()}
              className="rounded-xl bg-gradient-to-r from-cyan-400/90 to-violet-400/90 px-4 py-2 text-[12px] font-semibold text-slate-950 disabled:opacity-40"
            >
              生成
            </button>
          </form>
        </div>

        {/* ギャラリー */}
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-medium text-cyan-100">ギャラリー</p>
            <div className="flex gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => void handleUpload(e.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => fileRef.current?.click()}
                className="rounded-full border border-white/12 px-3 py-1.5 text-[11px] text-slate-200 hover:bg-white/5 disabled:opacity-50"
              >
                アップロード
              </button>
              <button
                type="button"
                disabled={busy || loading}
                onClick={() => void loadImages()}
                className="rounded-full border border-white/12 px-3 py-1.5 text-[11px] text-slate-200 hover:bg-white/5 disabled:opacity-50"
              >
                更新
              </button>
            </div>
          </div>

          {error && (
            <p className="mt-3 rounded-lg border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-100">
              {error}
            </p>
          )}

          {loading ? (
            <p className="mt-6 text-sm text-slate-500">読み込み中…</p>
          ) : (
            <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-2">
              {images.map((img) => (
                <li
                  key={img.id}
                  className="overflow-hidden rounded-xl border border-white/10 bg-black/25"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.imageUrl}
                    alt={img.title}
                    className="aspect-square w-full object-cover"
                  />
                  <div className="space-y-1 px-2.5 py-2">
                    <p className="truncate text-[12px] font-medium text-white">{img.title}</p>
                    <p className="text-[10px] text-slate-500">
                      {img.source === "base"
                        ? "ベース（削除不可）"
                        : img.source === "generate"
                          ? `生成${img.model ? ` · ${img.model}` : ""}`
                          : "アップロード"}
                      {img.byteSize > 0 ? ` · ${Math.round(img.byteSize / 1024)}KB` : ""}
                    </p>
                    <div className="flex flex-wrap gap-2 pt-0.5">
                      <button
                        type="button"
                        onClick={() => void handleDownload(img)}
                        className="text-[11px] text-cyan-200/90 underline"
                      >
                        DL
                      </button>
                      {!img.locked && img.source !== "base" && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleDelete(img.id)}
                          className="text-[11px] text-rose-200/90 underline disabled:opacity-50"
                        >
                          削除
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
