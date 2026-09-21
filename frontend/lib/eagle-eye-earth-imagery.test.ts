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
  // jsdom 無しの Node では window が無い → 相対はそのまま（ブラウザで origin 解決）
  assert.equal(absoluteSameOriginUrl(EAGLE_EYE_LOCAL_EARTH_TEXTURE), EAGLE_EYE_LOCAL_EARTH_TEXTURE);
}

{
  // 軌道: 楕円体成功のみ — 「ローカル地球・楕円体保険」の弱オラクル文言を出さない
  const orbit = describeEagleEyeEarthLayer(
    {
      usedNaturalEarth: false,
      usedLocalEarth: false,
      usedOverlay: false,
      usedEarthEntity: true,
    },
    "orbit",
  );
  assert.equal(orbit, "テクスチャ地球");
  assert.ok(!orbit.includes("保険"), "保険という言葉で黒玉成功を偽装しない");
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
