/**
 * Cesium 用: 衛星と地上カメラで形の違うアイコン（Canvas → data URL）
 */

const iconCache = new Map<string, string>();

/** 衛星: 菱形＋アンテナ風のシルエット */
export function getSatelliteIconDataUrl(fill: string): string {
  const key = `sat:${fill}`;
  const cached = iconCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = 48;
  canvas.height = 48;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.clearRect(0, 0, 48, 48);

  // 本体（菱形）
  ctx.beginPath();
  ctx.moveTo(24, 6);
  ctx.lineTo(38, 24);
  ctx.lineTo(24, 42);
  ctx.lineTo(10, 24);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();

  // 太陽パネル
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillRect(4, 20, 8, 8);
  ctx.fillRect(36, 20, 8, 8);
  ctx.strokeStyle = fill;
  ctx.lineWidth = 1;
  ctx.strokeRect(4, 20, 8, 8);
  ctx.strokeRect(36, 20, 8, 8);

  const url = canvas.toDataURL("image/png");
  iconCache.set(key, url);
  return url;
}

/** 地上カメラ: CCTV 風（台座＋筐体＋レンズ）— 衛星の菱形と明確に区別 */
export function getGroundCameraIconDataUrl(fill: string): string {
  const key = `cam:${fill}`;
  const cached = iconCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = 56;
  canvas.height = 56;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.clearRect(0, 0, 56, 56);

  // ポール
  ctx.fillStyle = "#e2e8f0";
  ctx.fillRect(26, 34, 4, 16);

  // 筐体
  roundRect(ctx, 10, 12, 30, 22, 5);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();

  // レンズ
  ctx.beginPath();
  ctx.arc(40, 23, 9, 0, Math.PI * 2);
  ctx.fillStyle = "#0f172a";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(40, 23, 5, 0, Math.PI * 2);
  ctx.fillStyle = "#7dd3fc";
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // 録画インジケータ
  ctx.beginPath();
  ctx.arc(16, 18, 2.5, 0, Math.PI * 2);
  ctx.fillStyle = "#f87171";
  ctx.fill();

  const url = canvas.toDataURL("image/png");
  iconCache.set(key, url);
  return url;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
