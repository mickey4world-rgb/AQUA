/**
 * Travel geocode 回帰オラクル（ネットワーク不要）。
 * 失敗クラス: 「行き先近傍のピン」が他県・国外に飛ぶ / 汚染住所で悪化する。
 *
 * Run: npx tsx lib/travel-geocode-query.test.ts
 */
import assert from "node:assert/strict";
import {
  buildGeocodeCandidates,
  inferRegionBias,
  isCoordInRegion,
  pickBestPhotonFeature,
  resolveLocalTravelPlaceForStop,
  sanitizeAddressForGeocode,
} from "./travel-geocode-query";

function ok(cond: unknown, msg: string) {
  assert.ok(cond, msg);
}

// --- 行き先から領域推論（北海道特例ではない） ---
{
  const hokkaido = inferRegionBias("北海道の旅");
  ok(hokkaido && hokkaido.id.includes("hokkaido"), "北海道 → hokkaido region");
  ok(
    hokkaido && isCoordInRegion(43.31, 145.34, hokkaido),
    "風蓮湖 coords in Hokkaido region",
  );
  ok(
    hokkaido && !isCoordInRegion(34.76, 137.38, hokkaido),
    "豊橋 coords NOT in Hokkaido region",
  );

  const kyoto = inferRegionBias("春の京都");
  ok(kyoto && kyoto.label.includes("京都"), "春の京都 → 京都府");
  ok(kyoto && isCoordInRegion(35.01, 135.77, kyoto), "京都駅付近は京都領域内");
  ok(kyoto && !isCoordInRegion(43.06, 141.35, kyoto), "札幌は京都領域外");

  const kansai = inferRegionBias("京都・奈良");
  ok(
    kansai && (kansai.id.includes("kyoto") || kansai.label.includes("奈良")),
    "京都・奈良 → 複数県",
  );
}

// --- ローカル辞書がホテル同名誤爆より先 ---
{
  const akan = resolveLocalTravelPlaceForStop("ニュー阿寒ホテル", {
    destinationHint: "北海道",
  });
  ok(akan && akan.label.includes("阿寒"), "ニュー阿寒ホテル → 阿寒系ローカル");
  ok(
    akan && isCoordInRegion(akan.lat, akan.lon, inferRegionBias("北海道")),
    "阿寒ローカルは道内",
  );

  const shiretoko = resolveLocalTravelPlaceForStop("知床散策", {
    destinationHint: "北海道",
  });
  ok(shiretoko && shiretoko.label.includes("知床"), "知床 → ローカル");
}

// --- 汚染住所は捨てる ---
{
  const cleaned = sanitizeAddressForGeocode(
    "愛知県豊橋市なんとか",
    "北海道",
  );
  ok(cleaned === undefined, "豊橋住所は北海道旅行では捨てる");

  const keep = sanitizeAddressForGeocode("北海道野付郡別海町", "北海道");
  ok(!!keep, "別海住所は残す");
}

// --- Photon 候補選別: 領域外は捨てる ---
{
  const region = inferRegionBias("北海道");
  const toyohashi = {
    geometry: { coordinates: [137.379, 34.761] as number[] },
    properties: {
      name: "ニュー阿寒ホテル",
      city: "豊橋市",
      state: "愛知県",
      countrycode: "jp",
      osm_value: "hotel",
    },
  };
  const akanLake = {
    geometry: { coordinates: [144.094, 43.436] as number[] },
    properties: {
      name: "阿寒湖",
      city: "釧路市",
      state: "北海道",
      countrycode: "jp",
      osm_value: "lake",
    },
  };
  const china = {
    geometry: { coordinates: [116.4, 39.9] as number[] },
    properties: {
      name: "知床",
      country: "中国",
      countrycode: "cn",
    },
  };
  const picked = pickBestPhotonFeature([toyohashi, akanLake, china], {
    region,
  });
  ok(picked?.properties?.name === "阿寒湖", "豊橋・中国を捨て阿寒湖を選ぶ");
}

// --- 候補に行き先ラベルが載る ---
{
  const cands = buildGeocodeCandidates(
    { name: "清水寺" },
    "京都",
  );
  ok(
    cands.some((c) => c.includes("京都")),
    "京都行き先なら候補に京都が付く",
  );
}

console.log("travel-geocode-query.test.ts: all passed");
