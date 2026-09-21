/**
 * Eagle Eye — 地球／地図イメージの「見える」保証。
 *
 * 再発クラス（2026-09 実害・再発）:
 * - HUD「ローカル地球・楕円体保険」でも画面は星空の黒空洞
 * - 楕円体 Entity を Imagery の上に常時載せ、ImageMaterial が黒のままなら
 *   青玉／Blue Marble を覆い隠して「成功」に見える（weak oracle）
 * - 相対 URL が Cesium Resource / CESIUM_BASE_URL 解釈で 404 になり黒マテリアル
 *
 * 不変条件: 軌道俯瞰の初回ペイントで大陸が素人に分かる。
 * 手段:
 * - テクスチャは常に origin 絶対 URL + HTMLImageElement 先読み成功が必須
 * - 軌道: 検証済み Entity 楕円体を本体（globe は保険の海色のみ、または非表示）
 * - 地図: globe + タイル、楕円体は隠す
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

/**
 * HTMLImageElement で実デコードまで確認（fetch OK ≠ WebGL テクスチャ成功の逃げ道を塞ぐ）
 */
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
  // 軌道: 楕円体が本体。Imagery のみ成功表示は禁止クラス。
  if (imagery.usedEarthEntity) {
    const extra = imagery.usedLocalEarth ? " · グローブ併用" : "";
    const overlay = imagery.usedOverlay ? " · タイル上乗せ" : "";
    return `テクスチャ地球${extra}${overlay}`;
  }
  if (imagery.usedLocalEarth) return "ローカル地球（グローブ）";
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

/** 同一オリジン Blue Marble — ImageryLayer（地図モード土台） */
export async function createVerifiedLocalEarthLayer(Cesium: CesiumLike) {
  const url = absoluteSameOriginUrl(EAGLE_EYE_LOCAL_EARTH_TEXTURE);
  const ok = await probeReachableImage(url);
  if (!ok) {
    throw new Error(
      `ローカル地球テクスチャに到達できません（${url}）。匿名配信か確認してください。`,
    );
  }
  // WebGL に載る前にデコード成功を要求
  await preloadImageElement(url);

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
 * 軌道俯瞰の本体: 先読み済みテクスチャの楕円体 Entity。
 * 衛星 billboard と同じ entities 経路。黒マテリアルで globe を覆うことは禁止。
 */
export async function ensureEarthEllipsoidEntity(
  viewer: {
    entities: {
      getById: (id: string) => { show?: boolean } | undefined;
      removeById?: (id: string) => boolean;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      add: (opts: Record<string, unknown>) => any;
    };
  },
  Cesium: CesiumLike,
): Promise<boolean> {
  const url = absoluteSameOriginUrl(EAGLE_EYE_LOCAL_EARTH_TEXTURE);
  let img: HTMLImageElement;
  try {
    img = await preloadImageElement(url);
  } catch (error) {
    console.error("[EagleEye] earth entity texture preload failed", error);
    return false;
  }

  const existing = viewer.entities.getById(EAGLE_EYE_EARTH_ENTITY_ID);
  if (existing) {
    viewer.entities.removeById?.(EAGLE_EYE_EARTH_ENTITY_ID);
  }

  // グローブよりわずかに大きくし、depth で隠れないようにする
  const rMax = Cesium.Ellipsoid.WGS84.maximumRadius * 1.0015;
  const rMin = Cesium.Ellipsoid.WGS84.minimumRadius * 1.0015;
  viewer.entities.add({
    id: EAGLE_EYE_EARTH_ENTITY_ID,
    position: Cesium.Cartesian3.ZERO,
    ellipsoid: {
      radii: new Cesium.Cartesian3(rMax, rMax, rMin),
      material: new Cesium.ImageMaterialProperty({
        image: img,
        transparent: false,
      }),
      subdivisions: 128,
    },
  });
  return true;
}

export function setEarthEllipsoidEntityVisible(
  viewer: { entities: { getById: (id: string) => { show?: boolean } | undefined } },
  visible: boolean,
) {
  const entity = viewer.entities.getById(EAGLE_EYE_EARTH_ENTITY_ID);
  if (entity) entity.show = visible;
}

/**
 * Viewer 生成前: ローカル Blue Marble を baseLayer 候補にする。
 * 軌道では Entity が本体なので、失敗しても Viewer 生成は続行可。
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
