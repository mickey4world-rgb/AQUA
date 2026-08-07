/** 鷹の目 — 人工衛星 TLE（CelesTrak 公開データベース由来） */

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
  info?: string;
  mediaUrl?: string;
  mediaType?: "image" | "video";
  /** 公開ライブストリーム（YouTube embed 等） */
  liveStreamUrl?: string;
  footprint?: EagleEyeFootprint;
  tle1: string;
  tle2: string;
}

const ISS: EagleEyeSatelliteDef = {
  id: "iss",
  name: "ISS (ZARYA)",
  noradId: 25544,
  category: "stations",
  info: "国際宇宙ステーション。約90分周期で地球を周回。NASA 公開の地球ライブ映像をリアルタイム配信中。",
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
};

const NOAA19: EagleEyeSatelliteDef = {
  id: "noaa19",
  name: "NOAA-19",
  noradId: 33591,
  category: "weather",
  info: "NOAA-19 気象衛星。極軌道で全球の気象・雲画像を取得します。",
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
};

const LANDSAT8: EagleEyeSatelliteDef = {
  id: "landsat8",
  name: "LANDSAT 8",
  noradId: 39084,
  category: "resource",
  info: "LANDSAT 8 地球観測衛星。地表の高解像度マルチスペクトル画像を提供します。",
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
};

export const EAGLE_EYE_SATELLITES: EagleEyeSatelliteDef[] = [ISS, NOAA19, LANDSAT8];

export type GroundMediaType = "video" | "image";

/** 地上メディア（ライブ映像・静止画） */
export interface GroundCamera {
  id: string;
  name: string;
  type: "防犯カメラ" | "車載カメラ" | "ドローンカメラ" | "固定カメラ" | "ライブカメラ" | "静止画";
  lat: number;
  lon: number;
  headingDeg: number;
  fovDeg: number;
  rangeM: number;
  mediaType: GroundMediaType;
  /** video: YouTube embed / image: 画像 URL */
  mediaUrl: string;
}

export const GROUND_CAMERAS: GroundCamera[] = [
  {
    id: "shibuya",
    name: "渋谷スクランブル交差点",
    type: "ライブカメラ",
    lat: 35.6595,
    lon: 139.7004,
    headingDeg: 45,
    fovDeg: 70,
    rangeM: 120,
    mediaType: "video",
    mediaUrl: "https://www.youtube.com/embed/DjdUEyjx8GM?autoplay=1&mute=1&rel=0",
  },
  {
    id: "tokyo-tower",
    name: "東京タワー周辺",
    type: "固定カメラ",
    lat: 35.6586,
    lon: 139.7454,
    headingDeg: 180,
    fovDeg: 55,
    rangeM: 200,
    mediaType: "video",
    mediaUrl: "https://www.youtube.com/embed/1-iS7LArP0Y?autoplay=1&mute=1&rel=0",
  },
  {
    id: "akihabara",
    name: "秋葉原エリア",
    type: "車載カメラ",
    lat: 35.6984,
    lon: 139.7731,
    headingDeg: 270,
    fovDeg: 90,
    rangeM: 80,
    mediaType: "video",
    mediaUrl: "https://www.youtube.com/embed/1-iS7LArP0Y?autoplay=1&mute=1&rel=0",
  },
  {
    id: "haneda",
    name: "羽田空港",
    type: "ドローンカメラ",
    lat: 35.5494,
    lon: 139.7798,
    headingDeg: 315,
    fovDeg: 60,
    rangeM: 150,
    mediaType: "video",
    mediaUrl: "https://www.youtube.com/embed/1-iS7LArP0Y?autoplay=1&mute=1&rel=0",
  },
  {
    id: "skytree-view",
    name: "東京スカイツリー展望",
    type: "静止画",
    lat: 35.7101,
    lon: 139.8107,
    headingDeg: 225,
    fovDeg: 50,
    rangeM: 300,
    mediaType: "image",
    mediaUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b2/View_of_Tokyo_from_the_Tokyo_Skytree%2C_Japan%2C_2015.jpg/640px-View_of_Tokyo_from_the_Tokyo_Skytree%2C_Japan%2C_2015.jpg",
  },
  {
    id: "tokyo-skyline",
    name: "都心スカイライン",
    type: "静止画",
    lat: 35.6812,
    lon: 139.7671,
    headingDeg: 90,
    fovDeg: 65,
    rangeM: 250,
    mediaType: "image",
    mediaUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Tokyo_Skyline_2021.jpg/640px-Tokyo_Skyline_2021.jpg",
  },
  {
    id: "shinjuku-live",
    name: "新宿歌舞伎町",
    type: "ライブカメラ",
    lat: 35.6938,
    lon: 139.7034,
    headingDeg: 135,
    fovDeg: 75,
    rangeM: 100,
    mediaType: "video",
    mediaUrl: "https://www.youtube.com/embed/DjdUEyjx8GM?autoplay=1&mute=1&rel=0",
  },
  {
    id: "disney-area",
    name: "舞浜周辺",
    type: "静止画",
    lat: 35.6329,
    lon: 139.8804,
    headingDeg: 0,
    fovDeg: 60,
    rangeM: 180,
    mediaType: "image",
    mediaUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Tokyo_from_space.jpg/640px-Tokyo_from_space.jpg",
  },
];

export const ORBIT_WINDOW_MINUTES = 45;
export const ORBIT_SAMPLE_MINUTES = 1;
export const IMAGING_ROI = { lat: 35.6812, lon: 139.7671 };

export const GROUND_PIN_COLORS = {
  video: "#fb923c",
  image: "#38bdf8",
} as const;
