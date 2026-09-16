/**
 * Eagle Eye — 地球／地図イメージの「見える」保証。
 *
 * 再発クラス（2026-09 実害）:
 * - HUD「Natural Earth」成功でも画面は真っ黒（レイヤー追加 ≠ 楕円体に塗られた）
 * - ensureEarthImagery が removeAll() で検証済み base を捨て、TMS/外部タイルの弱オラクルに戻る
 * - Natural Earth を優先し、ローカル Blue Marble（匿名・実 JPEG）を二の次にした
 *
 * 不変条件: 軌道俯瞰の初回ペイントで大陸が素人に分かる。
 * 手段: 同一オリジン Blue Marble を唯一の必須土台にし、Entity 楕円体を常時保険として載せる。
 */

export const EAGLE_EYE_LOCAL_EARTH_TEXTURE = "/vendor/eagle-eye/earth-day.jpg";
export const EAGLE_EYE_EARTH_ENTITY_ID = "eagle-eye-earth-ball";

export type EagleEyeImageryKind = "satellite" | "map" | "labels" | "base";

export type EagleEyeImageryCandidate = {
  kind: EagleEyeImageryKind;
  url: string;
  credit: string;
  maximumLevel: number;
};

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
];

export const EAGLE_EYE_SATELLITE_CANDIDATES: EagleEyeImageryCandidate[] = [
  ...EAGLE_EYE_MAP_CANDIDATES,
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
    usedEarthEntity: boolean;
  },
  mode: "orbit" | "map",
): string {
  const base = imagery.usedLocalEarth
    ? "ローカル地球"
    : imagery.usedEarthEntity
      ? "地球エンティティ"
      : imagery.usedNaturalEarth
        ? "Natural Earth"
        : "なし";
  const overlay = imagery.usedOverlay ? " · タイル上乗せ" : "";
  const insure = imagery.usedEarthEntity && imagery.usedLocalEarth ? " · 楕円体保険" : "";
  return mode === "map" ? `地図 · ${base}${overlay}` : `${base}${overlay}${insure}`;
}

export type CesiumLike = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
};

async function awaitLayerReady(layer: { readyPromise?: Promise<unknown> } | null | undefined) {
  if (!layer?.readyPromise) return;
  try {
    await layer.readyPromise;
  } catch (error) {
    throw new Error(
      `地球レイヤーの ready に失敗: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** 同一オリジン Blue Marble — 必須土台（Natural Earth より優先） */
export async function createVerifiedLocalEarthLayer(Cesium: CesiumLike) {
  const url = EAGLE_EYE_LOCAL_EARTH_TEXTURE;
  const ok = await probeReachableImage(url);
  if (!ok) {
    throw new Error(
      `ローカル地球テクスチャに到達できません（${url}）。匿名配信か確認してください。`,
    );
  }

  let layer;
  if (Cesium.SingleTileImageryProvider?.fromUrl && Cesium.ImageryLayer?.fromProviderAsync) {
    layer = await Cesium.ImageryLayer.fromProviderAsync(
      Cesium.SingleTileImageryProvider.fromUrl(url, {
        credit: "NASA Blue Marble (local)",
      }),
    );
  } else {
    layer = new Cesium.ImageryLayer(
      new Cesium.SingleTileImageryProvider({
        url,
        credit: "NASA Blue Marble (local)",
      }),
    );
  }
  await awaitLayerReady(layer);
  return layer;
}

/**
 * 軌道俯瞰の保険: Imagery パイプラインが黒玉でも、テクスチャ付き楕円体は必ず見える。
 * WGS84 半径の Entity — 衛星 billboard と同じ WebGL 経路。
 */
export function ensureEarthEllipsoidEntity(viewer: {
  entities: {
    getById: (id: string) => { show?: boolean } | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    add: (opts: Record<string, unknown>) => any;
  };
}, Cesium: CesiumLike) {
  const existing = viewer.entities.getById(EAGLE_EYE_EARTH_ENTITY_ID);
  if (existing) {
    existing.show = true;
    return;
  }
  const rMax = Cesium.Ellipsoid.WGS84.maximumRadius * 1.002;
  const rMin = Cesium.Ellipsoid.WGS84.minimumRadius * 1.002;
  viewer.entities.add({
    id: EAGLE_EYE_EARTH_ENTITY_ID,
    position: Cesium.Cartesian3.ZERO,
    ellipsoid: {
      radii: new Cesium.Cartesian3(rMax, rMax, rMin),
      material: new Cesium.ImageMaterialProperty({
        image: EAGLE_EYE_LOCAL_EARTH_TEXTURE,
        transparent: false,
      }),
    },
  });
}

export function setEarthEllipsoidEntityVisible(
  viewer: { entities: { getById: (id: string) => { show?: boolean } | undefined } },
  visible: boolean,
) {
  const entity = viewer.entities.getById(EAGLE_EYE_EARTH_ENTITY_ID);
  if (entity) entity.show = visible;
}

/**
 * Viewer 生成前: 必ずローカル Blue Marble を baseLayer にする。
 * Natural Earth 優先は禁止（黒玉＋HUD成功の再発源）。
 */
export async function resolveEagleEyeBaseLayer(Cesium: CesiumLike): Promise<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  layer: any;
  usedNaturalEarth: boolean;
  usedLocalEarth: boolean;
}> {
  const layer = await createVerifiedLocalEarthLayer(Cesium);
  return { layer, usedNaturalEarth: false, usedLocalEarth: true };
}
