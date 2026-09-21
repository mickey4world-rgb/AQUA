/**
 * Eagle Eye 地球テクスチャ URL / HUD 文言のオラクル
 * Run: npx --yes tsx lib/eagle-eye-earth-imagery.test.ts
 */
import assert from "node:assert/strict";
import {
  absoluteSameOriginUrl,
  describeEagleEyeEarthLayer,
  EAGLE_EYE_LOCAL_EARTH_TEXTURE,
} from "./eagle-eye-earth-imagery";

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
  const map = describeEagleEyeEarthLayer(
    {
      usedNaturalEarth: false,
      usedLocalEarth: true,
      usedOverlay: true,
      usedEarthEntity: false,
    },
    "map",
  );
  assert.equal(map, "地図 · ローカル地球 · タイル上乗せ");
}

console.log("eagle-eye-earth-imagery.test.ts: ok");
