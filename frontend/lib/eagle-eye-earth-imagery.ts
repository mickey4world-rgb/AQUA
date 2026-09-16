/**
 * Eagle Eye — 地球／地図イメージの「見える」保証。
 *
 * 過去の失敗クラス:
 * - baseLayer:false + 同期 addImageryProvider 成功 = 大陸が見える、と誤判定
 * - /space/* 認証の下に earth-day.jpg を置き「同一オリジン保証」と書いたが、
 *   Cesium の匿名 CORS 取得や未ログイン probe では 302 HTML になり黒玉／空洞になる
 * - Natural Earth を maximumLevel:5 の UrlTemplate で読み、存在しないタイルを大量 404
 *
 * 不変条件: 素人に大陸 or 地図の色が見える。レイヤー数や HUD 文言だけでは不足。
 */

export const EAGLE_EYE_LOCAL_EARTH_TEXTURE = "/vendor/eagle-eye/earth-day.jpg";
/** 旧パス（認証壁の下）。参照禁止・probe でも失敗させる */
export const EAGLE_EYE_LEGACY_EARTH_TEXTURE = "/space/earth-day.jpg";

export type EagleEyeImageryKind = "satellite" | "map" | "labels" | "base";

export type EagleEyeImageryCandidate = {
  kind: EagleEyeImageryKind;
  url: string;
  credit: string;
  maximumLevel: number;
};

export const EAGLE_EYE_SATELLITE_CANDIDATES: EagleEyeImageryCandidate[] = [
  {
    kind: "satellite",
    url: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    credit: "Esri World Imagery",
    maximumLevel: 19,
  },
  {
    kind: "map",
    url: "https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
    credit: "Carto Voyager",
    maximumLevel: 18,
  },
  {
    kind: "map",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    credit: "© OpenStreetMap",
    maximumLevel: 18,
  },
];

export const EAGLE_EYE_MAP_CANDIDATES: EagleEyeImageryCandidate[] = [
  {
    kind: "map",
    url: "https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
    credit: "Carto Voyager",
    maximumLevel: 18,
  },
  {
    kind: "map",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    credit: "© OpenStreetMap",
    maximumLevel: 18,
  },
  {
    kind: "satellite",
    url: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    credit: "Esri World Imagery",
    maximumLevel: 19,
  },
];

export const EAGLE_EYE_LABEL_CANDIDATE: EagleEyeImageryCandidate = {
  kind: "labels",
  url: "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
  credit: "Esri Labels",
  maximumLevel: 18,
};

/** 画像として読める URL か（HTML ログインページへの 302 を拒否） */
export async function probeReachableImage(url: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const absolute = url.startsWith("http")
    ? url
    : new URL(url, window.location.origin).toString();
  const sameOrigin = absolute.startsWith(window.location.origin);
  try {
    const res = await fetch(absolute, {
      method: "GET",
      mode: sameOrigin ? "same-origin" : "cors",
      credentials: sameOrigin ? "same-origin" : "omit",
      cache: "no-cache",
    });
    if (!res.ok) return false;
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("text/html") || ct.includes("application/json")) return false;
    if (ct.startsWith("image/")) return true;
    // 一部 CDN は content-type を省略するため、先頭バイトで JPEG/PNG を確認
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length < 4) return false;
    const jpeg = buf[0] === 0xff && buf[1] === 0xd8;
    const png = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    return jpeg || png;
  } catch {
    return false;
  }
}

export function describeEagleEyeEarthLayer(
  imagery: {
    usedNaturalEarth: boolean;
    usedLocalEarth: boolean;
    usedOverlay: boolean;
  },
  mode: "orbit" | "map",
): string {
  const base = imagery.usedNaturalEarth
    ? "Natural Earth"
    : imagery.usedLocalEarth
      ? "ローカル地球"
      : "なし";
  const overlay = imagery.usedOverlay ? " · タイル上乗せ" : "";
  return mode === "map" ? `地図 · ${base}${overlay}` : `${base}${overlay}`;
}

export type CesiumLike = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
};

export async function createVerifiedNaturalEarthLayer(Cesium: CesiumLike) {
  const base = Cesium.buildModuleUrl("Assets/Textures/NaturalEarthII");
  const tileOk = await probeReachableImage(`${base}/0/0/0.jpg`);
  if (!tileOk) {
    throw new Error("Natural Earth タイルに到達できません");
  }

  if (Cesium.TileMapServiceImageryProvider?.fromUrl && Cesium.ImageryLayer?.fromProviderAsync) {
    return Cesium.ImageryLayer.fromProviderAsync(
      Cesium.TileMapServiceImageryProvider.fromUrl(base, {
        fileExtension: "jpg",
        maximumLevel: 2,
      }),
    );
  }

  return new Cesium.ImageryLayer(
    new Cesium.UrlTemplateImageryProvider({
      url: `${base}/{z}/{x}/{reverseY}.jpg`,
      tilingScheme: new Cesium.GeographicTilingScheme(),
      maximumLevel: 2,
      credit: "Natural Earth II",
    }),
  );
}

export async function createVerifiedLocalEarthLayer(Cesium: CesiumLike) {
  const url = EAGLE_EYE_LOCAL_EARTH_TEXTURE;
  const ok = await probeReachableImage(url);
  if (!ok) {
    throw new Error(
      `ローカル地球テクスチャに到達できません（${url}）。SWA の /space/* 認証壁に置いていないか確認してください。`,
    );
  }

  if (Cesium.SingleTileImageryProvider?.fromUrl && Cesium.ImageryLayer?.fromProviderAsync) {
    return Cesium.ImageryLayer.fromProviderAsync(
      Cesium.SingleTileImageryProvider.fromUrl(url, {
        credit: "NASA Blue Marble (local)",
      }),
    );
  }

  return new Cesium.ImageryLayer(
    new Cesium.SingleTileImageryProvider({
      url,
      credit: "NASA Blue Marble (local)",
    }),
  );
}

/**
 * Viewer 生成前に必ず検証済み baseLayer を返す。
 * baseLayer:false のまま起動しない（黒空洞の設計を禁止）。
 */
export async function resolveEagleEyeBaseLayer(Cesium: CesiumLike): Promise<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  layer: any;
  usedNaturalEarth: boolean;
  usedLocalEarth: boolean;
}> {
  try {
    const layer = await createVerifiedNaturalEarthLayer(Cesium);
    return { layer, usedNaturalEarth: true, usedLocalEarth: false };
  } catch (naturalError) {
    console.warn("[EagleEye] Natural Earth unavailable, using local earth", naturalError);
    const layer = await createVerifiedLocalEarthLayer(Cesium);
    return { layer, usedNaturalEarth: false, usedLocalEarth: true };
  }
}
