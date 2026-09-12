"use client";

import { useEffect, useRef, useState } from "react";

type RelationFaceCropModalProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: (faceDataUrl: string) => void;
  initialFile?: File | null;
};

const OUTPUT_SIZE = 192;

export default function RelationFaceCropModal({
  open,
  onClose,
  onConfirm,
  initialFile = null,
}: RelationFaceCropModalProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [cropSize, setCropSize] = useState(200);
  const [dragging, setDragging] = useState(false);
  const dragOrigin = useRef<{ x: number; y: number; ox: number; oy: number } | null>(
    null,
  );
  const frameRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    if (initialFile) {
      const url = URL.createObjectURL(initialFile);
      setSrc(url);
      return () => URL.revokeObjectURL(url);
    }
    setSrc(null);
  }, [open, initialFile]);

  useEffect(() => {
    if (!src) return;
    const img = new Image();
    img.onload = () => {
      setNatural({ w: img.naturalWidth, h: img.naturalHeight });
      const minSide = Math.min(img.naturalWidth, img.naturalHeight);
      const size = Math.max(80, Math.floor(minSide * 0.55));
      setCropSize(size);
      setOffset({
        x: Math.floor((img.naturalWidth - size) / 2),
        y: Math.floor((img.naturalHeight - size) / 2),
      });
    };
    img.src = src;
  }, [src]);

  if (!open) return null;

  function loadFile(file: File | null) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setSrc(url);
  }

  function clampOffset(next: { x: number; y: number }, size: number) {
    return {
      x: Math.max(0, Math.min(natural.w - size, next.x)),
      y: Math.max(0, Math.min(natural.h - size, next.y)),
    };
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!src) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);
    dragOrigin.current = {
      x: e.clientX,
      y: e.clientY,
      ox: offset.x,
      oy: offset.y,
    };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging || !dragOrigin.current || !frameRef.current || !natural.w) return;
    const rect = frameRef.current.getBoundingClientRect();
    const scaleX = natural.w / rect.width;
    const scaleY = natural.h / rect.height;
    const dx = (e.clientX - dragOrigin.current.x) * scaleX;
    const dy = (e.clientY - dragOrigin.current.y) * scaleY;
    setOffset(
      clampOffset(
        {
          x: dragOrigin.current.ox + dx,
          y: dragOrigin.current.oy + dy,
        },
        cropSize,
      ),
    );
  }

  function onPointerUp() {
    setDragging(false);
    dragOrigin.current = null;
  }

  function confirmCrop() {
    if (!src || !natural.w) return;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(
        img,
        offset.x,
        offset.y,
        cropSize,
        cropSize,
        0,
        0,
        OUTPUT_SIZE,
        OUTPUT_SIZE,
      );
      const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
      onConfirm(dataUrl);
      onClose();
    };
    img.src = src;
  }

  const displayScale =
    natural.w > 0 && frameRef.current
      ? frameRef.current.clientWidth / natural.w
      : 1;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-3 sm:items-center">
      <div className="w-full max-w-lg rounded-2xl border border-white/15 bg-[#0b1220] p-4 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base text-white">顔写真を切り出す</h3>
            <p className="mt-1 text-[12px] leading-relaxed text-slate-400">
              写真の顔あたりに枠を合わせてください。枠をドラッグで移動、スライダーで拡大縮小できます。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-slate-400 hover:text-white"
          >
            閉じる
          </button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => loadFile(e.target.files?.[0] ?? null)}
        />

        {!src ? (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="mt-4 w-full rounded-xl border border-dashed border-white/20 px-4 py-10 text-sm text-slate-300"
          >
            写真を撮影 / 選択
          </button>
        ) : (
          <>
            <div
              ref={frameRef}
              className="relative mt-4 overflow-hidden rounded-xl border border-white/10 bg-black"
              style={{ touchAction: "none" }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="切り出し元" className="block w-full select-none" draggable={false} />
              {natural.w > 0 && (
                <div
                  className="pointer-events-none absolute border-2 border-amber-200 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
                  style={{
                    left: `${(offset.x / natural.w) * 100}%`,
                    top: `${(offset.y / natural.h) * 100}%`,
                    width: `${(cropSize / natural.w) * 100}%`,
                    height: `${(cropSize / natural.h) * 100}%`,
                    borderRadius: "50%",
                  }}
                />
              )}
            </div>
            <label className="mt-3 flex items-center gap-3 text-[12px] text-slate-300">
              枠サイズ
              <input
                type="range"
                min={60}
                max={Math.max(80, Math.min(natural.w, natural.h))}
                value={cropSize}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setCropSize(next);
                  setOffset((prev) => clampOffset(prev, next));
                }}
                className="flex-1"
              />
            </label>
            <p className="mt-1 text-[11px] text-slate-500">
              表示スケール目安 {displayScale.toFixed(2)}x · 出力 {OUTPUT_SIZE}px 正方形
            </p>
          </>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded-lg border border-white/15 px-3 py-2 text-sm text-slate-200"
          >
            別の写真
          </button>
          <button
            type="button"
            disabled={!src}
            onClick={confirmCrop}
            className="rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-sm text-amber-50 disabled:opacity-40"
          >
            この範囲で顔登録
          </button>
        </div>
      </div>
    </div>
  );
}
