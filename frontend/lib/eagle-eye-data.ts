/** 鷹の目 — 人工衛星 TLE（CelesTrak 公開データベース由来の代表値） */

export interface EagleEyeSatelliteDef {
  id: string;
  name: string;
  /** 衛星が監視する地上エリア（衛星選択時にオーバーレイ表示） */
  footprint: {
    west: number;
    south: number;
    east: number;
    north: number;
    imageUrl: string;
    label: string;
  };
  tle1: string;
  tle2: string;
}

/** 国際宇宙ステーション (ISS) */
const ISS: EagleEyeSatelliteDef = {
  id: "iss",
  name: "ISS (ZARYA)",
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
};

/** NOAA-19 気象衛星 */
const NOAA19: EagleEyeSatelliteDef = {
  id: "noaa19",
  name: "NOAA-19",
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
};

/** LANDSAT 8 地球観測衛星 */
const LANDSAT8: EagleEyeSatelliteDef = {
  id: "landsat8",
  name: "LANDSAT 8",
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
};

export const EAGLE_EYE_SATELLITES: EagleEyeSatelliteDef[] = [ISS, NOAA19, LANDSAT8];

/** 地上ライブカメラ（ダミー / 公開 YouTube ライブ） */
export interface GroundCamera {
  id: string;
  name: string;
  type: "防犯カメラ" | "車載カメラ" | "ドローンカメラ" | "固定カメラ";
  lat: number;
  lon: number;
  /** YouTube embed URL（autoplay 付き） */
  embedUrl: string;
}

export const GROUND_CAMERAS: GroundCamera[] = [
  {
    id: "shibuya",
    name: "渋谷スクランブル交差点 防犯カメラ",
    type: "防犯カメラ",
    lat: 35.6595,
    lon: 139.7004,
    embedUrl: "https://www.youtube.com/embed/DjdUEyjx8GM?autoplay=1&mute=1&rel=0",
  },
  {
    id: "tokyo-tower",
    name: "東京タワー周辺 固定カメラ",
    type: "固定カメラ",
    lat: 35.6586,
    lon: 139.7454,
    embedUrl: "https://www.youtube.com/embed/1-iS7LArP0Y?autoplay=1&mute=1&rel=0",
  },
  {
    id: "akihabara",
    name: "秋葉原 車載カメラ（巡回中）",
    type: "車載カメラ",
    lat: 35.6984,
    lon: 139.7731,
    embedUrl: "https://www.youtube.com/embed/1-iS7LArP0Y?autoplay=1&mute=1&rel=0",
  },
  {
    id: "haneda",
    name: "羽田空港 ドローンカメラ",
    type: "ドローンカメラ",
    lat: 35.5494,
    lon: 139.7798,
    embedUrl: "https://www.youtube.com/embed/1-iS7LArP0Y?autoplay=1&mute=1&rel=0",
  },
];

/** 軌道計算の時間窓（分） */
export const ORBIT_WINDOW_MINUTES = 45;

/** 軌道サンプリング間隔（分） */
export const ORBIT_SAMPLE_MINUTES = 1;
