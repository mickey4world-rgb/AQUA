/**
 * クライアント側: 見た目（構図・色味）を保ったまま容量だけ落とす。
 * Cosmos 保管上限（約 900KB）に収まる JPEG を返す。
 */

export const SOLUNA_UPLOAD_TARGET_BYTES = 850_000;
const MAX_SIDE = 2048;

function dataUrlByteLength(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return dataUrl.length;
  const b64 = dataUrl.slice(comma + 1);
  return Math.floor((b64.length * 3) / 4);
}

/**
 * 長辺を抑えつつ JPEG 品質を段階的に下げ、表現内容はそのまま容量だけ削減する。
 */
export async function compressImageForSolunaUpload(
  file: File,
  targetBytes = SOLUNA_UPLOAD_TARGET_BYTES,
): Promise<{ dataUrl: string; compressed: boolean; originalBytes: number; finalBytes: number }> {
  const originalBytes = file.size;
  if (!file.type.startsWith("image/")) {
    throw new Error("画像ファイルを選んでください");
  }

  // すでに十分小さければそのまま（GIF アニメ等は再エンコードしない）
  if (originalBytes <= targetBytes && (file.type === "image/jpeg" || file.type === "image/webp")) {
    const dataUrl = await readAsDataUrl(file);
    return { dataUrl, compressed: false, originalBytes, finalBytes: originalBytes };
  }

  const bitmap = await createImageBitmap(file);
  try {
    let maxSide = Math.min(MAX_SIDE, Math.max(bitmap.width, bitmap.height));
    const qualities = [0.88, 0.8, 0.72, 0.64, 0.56, 0.48];

    let best = "";
    let bestBytes = Number.POSITIVE_INFINITY;

    for (let pass = 0; pass < 4; pass += 1) {
      const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("画像キャンバスを初期化できませんでした");
      ctx.drawImage(bitmap, 0, 0, width, height);

      for (const quality of qualities) {
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        const bytes = dataUrlByteLength(dataUrl);
        if (bytes < bestBytes) {
          best = dataUrl;
          bestBytes = bytes;
        }
        if (bytes <= targetBytes) {
          return {
            dataUrl,
            compressed: true,
            originalBytes,
            finalBytes: bytes,
          };
        }
      }
      maxSide = Math.max(640, Math.floor(maxSide * 0.75));
    }

    if (!best || bestBytes > targetBytes) {
      throw new Error(
        `画像を約 ${Math.round(targetBytes / 1024)}KB 以下に圧縮できませんでした。もっと小さい画像を選んでください。`,
      );
    }
    return { dataUrl: best, compressed: true, originalBytes, finalBytes: bestBytes };
  } finally {
    bitmap.close();
  }
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("ファイルの読み込みに失敗しました"));
    reader.readAsDataURL(file);
  });
}
