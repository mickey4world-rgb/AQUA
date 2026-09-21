/**
 * Eagle Eye 地球テクスチャ URL / HUD 文言のオラクル
 * Run: npx --yes tsx lib/eagle-eye-earth-imagery.test.ts
 */
import assert from "node:assert/strict";
import {
  absoluteSameOriginUrl,
  describeEagleEyeEarthLayer,
  EAGLE_EYE_LOCAL_EARTH_TEXTURE,
  EAGLE_EYE_MAP_CANDIDATES,
} from "./eagle-eye-earth-imagery";
import {
  FREE_BASEMAP_CANDIDATES,
  isUnauthenticatedCartoBasemapUrl,
} from "./maplibre-free-basemap";

{
  assert.equal(
    absoluteSameOriginUrl("https://example.com/a.jpg"),
    "https://example.com/a.jpg",
  );
  assert.equal(absoluteSameOriginUrl(EAGLE_EYE_LOCAL_EARTH_TEXTURE), EAGLE_EYE_LOCAL_EARTH_TEXTURE);
}

{
  // 軌道: globe SingleTile 本体 — 「テクスチャ地球」だけで Entity 成功を偽装しない
  assert.equal(
    describeEagleEyeEarthLayer(
      {
        usedNaturalEarth: false,
        usedLocalEarth: true,
        usedOverlay: false,
        usedEarthEntity: false,
      },
      "orbit",
    ),
    "ローカル地球",
  );
  assert.equal(
    describeEagleEyeEarthLayer(
      {
        usedNaturalEarth: false,
        usedLocalEarth: true,
        usedOverlay: false,
        usedEarthEntity: true,
      },
      "orbit",
    ),
    "ローカル地球 · Primitive保険",
  );
}

{
  assert.equal(
    describeEagleEyeEarthLayer(
      {
        usedNaturalEarth: false,
        usedLocalEarth: false,
        usedOverlay: true,
        usedEarthEntity: false,
      },
      "map",
    ),
    "地図 · メルカトルタイル",
  );
  assert.equal(
    describeEagleEyeEarthLayer(
      {
        usedNaturalEarth: false,
        usedLocalEarth: true,
        usedOverlay: true,
        usedEarthEntity: false,
      },
      "map",
    ),
    "地図 · ローカル地球 · タイル上乗せ",
  );
}

{
  // キー無し Carto は常に拒否（透かし PNG = 地図が見える、ではない）
  assert.equal(
    isUnauthenticatedCartoBasemapUrl(
      "https://a.basemaps.cartocdn.com/rastertiles/voyager/2/1/1.png",
    ),
    true,
  );
  assert.equal(
    isUnauthenticatedCartoBasemapUrl(
      "https://basemaps.cartocdn.com/rastertiles/voyager/2/1/1.png?api_key=demo",
    ),
    false,
  );
  assert.equal(
    isUnauthenticatedCartoBasemapUrl("https://tile.openstreetmap.de/2/1/1.png"),
    false,
  );
}

{
  // 候補にキー無し Carto を入れない
  for (const c of EAGLE_EYE_MAP_CANDIDATES) {
    assert.equal(isUnauthenticatedCartoBasemapUrl(c.url), false, c.credit);
    assert.ok(!c.url.includes("cartocdn.com"), c.credit);
  }
  for (const c of FREE_BASEMAP_CANDIDATES) {
    assert.ok(!c.tiles.some((t) => t.includes("cartocdn.com")), c.id);
    assert.ok(!c.sampleUrl.includes("{"), `sample must be concrete: ${c.id}`);
  }
  assert.ok(FREE_BASEMAP_CANDIDATES.length >= 2);
}

console.log("eagle-eye-earth-imagery.test.ts: ok");
