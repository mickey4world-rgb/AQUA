/** 鷹の目 — 人工衛星 TLE（CelesTrak 公開データベース由来）+ 地上カメラカタログ */

import { inferSatelliteCountry } from "@/lib/eagle-eye-country";

export interface EagleEyeFootprint {
  west: number;
  south: number;
  east: number;
  north: number;
  imageUrl: string;
  label: string;
}

export interface EagleEyeSatelliteDef {
  id: string;
  name: string;
  noradId?: number;
  category?: string;
  /** 運用国・機関（表示用） */
  country?: string;
  countryCode?: string;
  info?: string;
  /** 衛星の外観・機体写真 */
  appearanceUrl?: string;
  mediaUrl?: string;
  mediaType?: "image" | "video";
  liveStreamUrl?: string;
  footprint?: EagleEyeFootprint;
  tle1: string;
  tle2: string;
}

function withCountry(
  sat: Omit<EagleEyeSatelliteDef, "country" | "countryCode"> &
    Partial<Pick<EagleEyeSatelliteDef, "country" | "countryCode">>,
): EagleEyeSatelliteDef {
  const inferred = inferSatelliteCountry(sat.name, sat.category);
  return {
    ...sat,
    country: sat.country ?? inferred.country,
    countryCode: sat.countryCode ?? inferred.countryCode,
  };
}

const ISS: EagleEyeSatelliteDef = withCountry({
  id: "iss",
  name: "ISS (ZARYA)",
  noradId: 25544,
  category: "stations",
  country: "国際",
  countryCode: "INT",
  info: "国際宇宙ステーション。約90分周期で地球を周回。NASA 公開の地球ライブ映像をリアルタイム配信中。",
  appearanceUrl:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/0/04/International_Space_Station_after_undocking_of_STS-132.jpg/640px-International_Space_Station_after_undocking_of_STS-132.jpg",
  mediaUrl:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Tokyo_from_space.jpg/640px-Tokyo_from_space.jpg",
  mediaType: "video",
  liveStreamUrl: "https://www.youtube.com/embed/iYmvCUonukw?autoplay=1&mute=1&rel=0",
  footprint: {
    west: 139.35,
    south: 35.45,
    east: 139.95,
    north: 35.85,
    label: "東京湾岸 — 衛星スキャンエリア",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Tokyo_from_space.jpg/640px-Tokyo_from_space.jpg",
  },
  tle1: "1 25544U 98067A   24001.50000000  .00016717  00000-0  10270-3 0  9993",
  tle2: "2 25544  51.6400 247.4627 0006703 130.5360 325.0288 15.49507979 89979",
});

const NOAA19: EagleEyeSatelliteDef = withCountry({
  id: "noaa19",
  name: "NOAA-19",
  noradId: 33591,
  category: "weather",
  country: "アメリカ",
  countryCode: "US",
  info: "NOAA-19 気象衛星。極軌道で全球の気象・雲画像を取得します。",
  appearanceUrl:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/NOAA.jpg/640px-NOAA.jpg",
  mediaUrl:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b2/View_of_Tokyo_from_the_Tokyo_Skytree%2C_Japan%2C_2015.jpg/640px-View_of_Tokyo_from_the_Tokyo_Skytree%2C_Japan%2C_2015.jpg",
  mediaType: "image",
  footprint: {
    west: 139.2,
    south: 35.3,
    east: 140.1,
    north: 36.0,
    label: "関東平野 — 気象衛星スキャン",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b2/View_of_Tokyo_from_the_Tokyo_Skytree%2C_Japan%2C_2015.jpg/640px-View_of_Tokyo_from_the_Tokyo_Skytree%2C_Japan%2C_2015.jpg",
  },
  tle1: "1 33591U 09005A   24001.50000000  .00000086  00000-0  52969-4 0  9990",
  tle2: "2 33591  99.1920  68.3159 0013468  74.5643 285.7048 14.14594305101234",
});

const LANDSAT8: EagleEyeSatelliteDef = withCountry({
  id: "landsat8",
  name: "LANDSAT 8",
  noradId: 39084,
  category: "resource",
  country: "アメリカ",
  countryCode: "US",
  info: "LANDSAT 8 地球観測衛星。地表の高解像度マルチスペクトル画像を提供します。",
  appearanceUrl:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d2/Landsat_8_artist%27s_concept.jpg/640px-Landsat_8_artist%27s_concept.jpg",
  mediaUrl:
    "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Tokyo_Skyline_2021.jpg/640px-Tokyo_Skyline_2021.jpg",
  mediaType: "image",
  footprint: {
    west: 139.4,
    south: 35.5,
    east: 139.9,
    north: 35.9,
    label: "都心部 — 高解像度観測",
    imageUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Tokyo_Skyline_2021.jpg/640px-Tokyo_Skyline_2021.jpg",
  },
  tle1: "1 39084U 13008A   24001.50000000  .00000000  00000-0  00000-0 0  9997",
  tle2: "2 39084  98.2214 257.6456 0001159  88.4012 271.7217 14.57108433101234",
});

export const EAGLE_EYE_SATELLITES: EagleEyeSatelliteDef[] = [ISS, NOAA19, LANDSAT8];

export type {
  GroundCamera,
  GroundMediaType,
} from "@/lib/eagle-eye-ground-cameras";
export {
  GROUND_CAMERAS,
  GROUND_CAMERA_DIRECTORIES,
  GROUND_PIN_COLORS,
} from "@/lib/eagle-eye-ground-cameras";

export const ORBIT_WINDOW_MINUTES = 45;
export const ORBIT_SAMPLE_MINUTES = 1;
export const IMAGING_ROI = { lat: 35.6812, lon: 139.7671, label: "東京" };
