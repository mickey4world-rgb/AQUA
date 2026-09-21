/**
 * Eagle Eye — 地球／地図イメージの「見える」保証。
 *
 * 再発クラス（2026-09 三度目）:
 * - Entity + ImageMaterialProperty は楕円体に塗れず、globe を hide した結果
 *   大気の青い輪郭だけが残り HUD「テクスチャ地球」成功（preload ≠ 塗布）
 *
 * 不変条件: 軌道俯瞰の初回ペイントで大陸が素人に分かる。
 * 手段:
 * - 本体: globe.show=true + 検証済み SingleTileImageryProvider（絶対 URL）
 * - 保険: Primitive + Material.fromType('Image')（Entity ImageMaterial は使わない）
 * - 地図: globe + タイル、Primitive 保険は隠す
 */

export const EAGLE_EYE_LOCAL_EARTH_TEXTURE = "/vendor/eagle-eye/earth-day.jpg";
export const EAGLE_EYE_EARTH_ENTITY_ID = "eagle-eye-earth-ball";
export const EAGLE_EYE_EARTH_PRIMITIVE_ID = "eagle-eye-earth-primitive";

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

/** ページ origin 上の絶対 URL（Cesium が CESIUM_BASE_URL 相対にしない） */
export function absoluteSameOriginUrl(pathOrUrl: string): string {
  if (typeof window === "undefined") {
    if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
      return pathOrUrl;
    }
    return pathOrUrl;
  }
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) {
    return pathOrUrl;
  }
  return new URL(pathOrUrl, window.location.origin).toString();
}

/** 画像として読める URL か（HTML ログインページへの 302 を拒否） */
export async function probeReachableImage(url: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const absolute = absoluteSameOriginUrl(url);
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

/** HTMLImageElement で実デコードまで確認 */
export function preloadImageElement(url: string): Promise<HTMLImageElement> {
  const absolute = absoluteSameOriginUrl(url);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (img.naturalWidth < 8 || img.naturalHeight < 8) {
        reject(new Error(`地球テクスチャが小さすぎます: ${absolute}`));
        return;
      }
      resolve(img);
    };
    img.onerror = () => reject(new Error(`地球テクスチャのデコード失敗: ${absolute}`));
    img.src = absolute;
  });
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
  if (mode === "map") {
    const base = imagery.usedLocalEarth
      ? "ローカル地球"
      : imagery.usedOverlay
        ? "外部タイル"
        : "なし";
    const overlay = imagery.usedOverlay && imagery.usedLocalEarth ? " · タイル上乗せ" : "";
    return `地図 · ${base}${overlay}`;
  }
  if (imagery.usedLocalEarth && imagery.usedEarthEntity) {
    return "ローカル地球 · Primitive保険";
  }
  if (imagery.usedLocalEarth) return "ローカル地球";
  if (imagery.usedEarthEntity) return "Primitive地球";
  return "なし";
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

/** 同一オリジン Blue Marble — globe の SingleTile（軌道・地図の本体） */
export async function createVerifiedLocalEarthLayer(Cesium: CesiumLike) {
  const url = absoluteSameOriginUrl(EAGLE_EYE_LOCAL_EARTH_TEXTURE);
  const ok = await probeReachableImage(url);
  if (!ok) {
    throw new Error(
      `ローカル地球テクスチャに到達できません（${url}）。匿名配信か確認してください。`,
    );
  }
  const img = await preloadImageElement(url);

  let layer;
  if (Cesium.SingleTileImageryProvider?.fromUrl && Cesium.ImageryLayer?.fromProviderAsync) {
    // fromUrl は画像を読み寸法を決める（tileWidth は constructor 専用）
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
        tileWidth: img.naturalWidth,
        tileHeight: img.naturalHeight,
      }),
    );
  }
  await awaitLayerReady(layer);
  return layer;
}

type ViewerWithPrimitives = {
  scene: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    primitives: { add: (p: any) => any; remove: (p: any) => boolean; length?: number; get?: (i: number) => any };
  };
  // stash for remove
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _eagleEyeEarthPrimitive?: any;
};

/**
 * 保険: Primitive + Material Image（Entity ImageMaterialProperty は塗れないので禁止）。
 * globe の上にわずかに大きい球として載せ、Imagery が黒でも大陸が見える。
 */
export async function ensureEarthTexturedPrimitive(
  viewer: ViewerWithPrimitives,
  Cesium: CesiumLike,
): Promise<boolean> {
  const url = absoluteSameOriginUrl(EAGLE_EYE_LOCAL_EARTH_TEXTURE);
  try {
    await preloadImageElement(url);
  } catch (error) {
    console.error("[EagleEye] earth primitive texture preload failed", error);
    return false;
  }

  if (viewer._eagleEyeEarthPrimitive) {
    try {
      viewer.scene.primitives.remove(viewer._eagleEyeEarthPrimitive);
    } catch {
      /* ignore */
    }
    viewer._eagleEyeEarthPrimitive = undefined;
  }

  const rMax = Cesium.Ellipsoid.WGS84.maximumRadius * 1.0008;
  const rMin = Cesium.Ellipsoid.WGS84.minimumRadius * 1.0008;
  const vertexFormat =
    Cesium.MaterialAppearance?.MaterialSupport?.TEXTURED?.vertexFormat ??
    Cesium.VertexFormat?.POSITION_AND_ST;

  try {
    const primitive = new Cesium.Primitive({
      geometryInstances: new Cesium.GeometryInstance({
        id: EAGLE_EYE_EARTH_PRIMITIVE_ID,
        geometry: new Cesium.EllipsoidGeometry({
          radii: new Cesium.Cartesian3(rMax, rMax, rMin),
          vertexFormat,
          stackPartitions: 64,
          slicePartitions: 64,
        }),
      }),
      appearance: new Cesium.MaterialAppearance({
        material: Cesium.Material.fromType("Image", {
          image: url,
          repeat: new Cesium.Cartesian2(1.0, 1.0),
        }),
        faceForward: true,
        flat: false,
        translucent: false,
      }),
      asynchronous: false,
      allowPicking: false,
    });
    viewer.scene.primitives.add(primitive);
    viewer._eagleEyeEarthPrimitive = primitive;
    return true;
  } catch (error) {
    console.error("[EagleEye] earth primitive failed", error);
    return false;
  }
}

export function setEarthTexturedPrimitiveVisible(
  viewer: ViewerWithPrimitives,
  visible: boolean,
) {
  const p = viewer._eagleEyeEarthPrimitive;
  if (p) p.show = visible;
}

/** @deprecated Entity ImageMaterial は塗れない。互換のため no-op で false。 */
export async function ensureEarthEllipsoidEntity(
  _viewer: unknown,
  _Cesium: CesiumLike,
): Promise<boolean> {
  return false;
}

export function setEarthEllipsoidEntityVisible(
  viewer: ViewerWithPrimitives & {
    entities?: { getById: (id: string) => { show?: boolean } | undefined; removeById?: (id: string) => boolean };
  },
  visible: boolean,
) {
  // 旧 Entity が残っていれば除去（黒／透明で覆わない）
  const ent = viewer.entities?.getById?.(EAGLE_EYE_EARTH_ENTITY_ID);
  if (ent && viewer.entities?.removeById) {
    viewer.entities.removeById(EAGLE_EYE_EARTH_ENTITY_ID);
  }
  setEarthTexturedPrimitiveVisible(viewer, visible);
}

/**
 * Viewer 生成前: ローカル Blue Marble を baseLayer にする。
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
