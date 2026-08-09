/** 鷹の目 — 人工衛星 TLE（CelesTrak 公開データベース由来）+ 地上カメラカタログ */

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
  /** 衛星の外観・機体写真 */
  appearanceUrl?: string;
  mediaUrl?: string;
  mediaType?: "image" | "video";
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
};

const NOAA19: EagleEyeSatelliteDef = {
  id: "noaa19",
  name: "NOAA-19",
  noradId: 33591,
  category: "weather",
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
};

const LANDSAT8: EagleEyeSatelliteDef = {
  id: "landsat8",
  name: "LANDSAT 8",
  noradId: 39084,
  category: "resource",
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
};

export const EAGLE_EYE_SATELLITES: EagleEyeSatelliteDef[] = [ISS, NOAA19, LANDSAT8];

export type GroundMediaType = "video" | "image";

export interface GroundCamera {
  id: string;
  name: string;
  type:
    | "防犯カメラ"
    | "車載カメラ"
    | "ドローンカメラ"
    | "固定カメラ"
    | "ライブカメラ"
    | "河川カメラ"
    | "道路カメラ"
    | "個人カメラ"
    | "静止画";
  lat: number;
  lon: number;
  headingDeg: number;
  fovDeg: number;
  rangeM: number;
  mediaType: GroundMediaType;
  mediaUrl: string;
}

/**
 * 公開地上カメラ／映像のキュレーションカタログ。
 * インターネット上のすべてを自動収集するのではなく、河川・道路・観光・個人公開など
 * 代表的な公開ソースを広くピン留めする。
 */
export const GROUND_CAMERAS: GroundCamera[] = [
  // —— 東京・関東（観光 / 交差点） ——
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
  // —— 空港 / 道路 ——
  {
    id: "haneda",
    name: "羽田空港アプローチ",
    type: "道路カメラ",
    lat: 35.5494,
    lon: 139.7798,
    headingDeg: 315,
    fovDeg: 60,
    rangeM: 150,
    mediaType: "video",
    mediaUrl: "https://www.youtube.com/embed/1-iS7LArP0Y?autoplay=1&mute=1&rel=0",
  },
  {
    id: "shutoko-ginza",
    name: "首都高・銀座付近（道路）",
    type: "道路カメラ",
    lat: 35.672,
    lon: 139.765,
    headingDeg: 20,
    fovDeg: 55,
    rangeM: 140,
    mediaType: "image",
    mediaUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Shuto_Expressway_C1_near_Ginza.jpg/640px-Shuto_Expressway_C1_near_Ginza.jpg",
  },
  {
    id: "yokohama-bay",
    name: "横浜ベイブリッジ（道路）",
    type: "道路カメラ",
    lat: 35.455,
    lon: 139.675,
    headingDeg: 90,
    fovDeg: 70,
    rangeM: 200,
    mediaType: "image",
    mediaUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Yokohama_Bay_Bridge_2015.jpg/640px-Yokohama_Bay_Bridge_2015.jpg",
  },
  // —— 河川 ——
  {
    id: "sumida-river",
    name: "隅田川・浅草付近（河川）",
    type: "河川カメラ",
    lat: 35.7105,
    lon: 139.801,
    headingDeg: 160,
    fovDeg: 65,
    rangeM: 180,
    mediaType: "image",
    mediaUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/Sumida_River_and_Tokyo_Skytree.jpg/640px-Sumida_River_and_Tokyo_Skytree.jpg",
  },
  {
    id: "arakawa",
    name: "荒川・河川敷",
    type: "河川カメラ",
    lat: 35.74,
    lon: 139.82,
    headingDeg: 210,
    fovDeg: 60,
    rangeM: 220,
    mediaType: "image",
    mediaUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Arakawa_River_in_Tokyo.jpg/640px-Arakawa_River_in_Tokyo.jpg",
  },
  {
    id: "tamagawa",
    name: "多摩川・二子玉川",
    type: "河川カメラ",
    lat: 35.611,
    lon: 139.63,
    headingDeg: 250,
    fovDeg: 70,
    rangeM: 200,
    mediaType: "image",
    mediaUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Tama_River_Futako-Tamagawa.jpg/640px-Tama_River_Futako-Tamagawa.jpg",
  },
  {
    id: "yodogawa",
    name: "淀川・大阪（河川）",
    type: "河川カメラ",
    lat: 34.72,
    lon: 135.48,
    headingDeg: 100,
    fovDeg: 60,
    rangeM: 250,
    mediaType: "image",
    mediaUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1e/Yodo_River_Osaka.jpg/640px-Yodo_River_Osaka.jpg",
  },
  // —— 地方都市 ——
  {
    id: "osaka-dotonbori",
    name: "大阪・道頓堀",
    type: "ライブカメラ",
    lat: 34.6687,
    lon: 135.5013,
    headingDeg: 90,
    fovDeg: 70,
    rangeM: 120,
    mediaType: "image",
    mediaUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2c/Dotonbori%2C_Osaka%2C_Japan.jpg/640px-Dotonbori%2C_Osaka%2C_Japan.jpg",
  },
  {
    id: "kyoto-gion",
    name: "京都・祇園",
    type: "個人カメラ",
    lat: 35.0037,
    lon: 135.778,
    headingDeg: 180,
    fovDeg: 50,
    rangeM: 100,
    mediaType: "image",
    mediaUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0b/Gion_Kyoto.jpg/640px-Gion_Kyoto.jpg",
  },
  {
    id: "sapporo-odori",
    name: "札幌・大通",
    type: "固定カメラ",
    lat: 43.06,
    lon: 141.35,
    headingDeg: 0,
    fovDeg: 65,
    rangeM: 160,
    mediaType: "image",
    mediaUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Odori_Park_Sapporo.jpg/640px-Odori_Park_Sapporo.jpg",
  },
  {
    id: "fukuoka-tenjin",
    name: "福岡・天神",
    type: "道路カメラ",
    lat: 33.59,
    lon: 130.4,
    headingDeg: 45,
    fovDeg: 60,
    rangeM: 140,
    mediaType: "image",
    mediaUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/5/55/Tenjin_Fukuoka.jpg/640px-Tenjin_Fukuoka.jpg",
  },
  // —— 個人 / 観光公開 ——
  {
    id: "fuji-view",
    name: "富士山展望（個人公開）",
    type: "個人カメラ",
    lat: 35.3606,
    lon: 138.7274,
    headingDeg: 0,
    fovDeg: 80,
    rangeM: 400,
    mediaType: "image",
    mediaUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f8/Mount_Fuji_from_Yamanaka.jpg/640px-Mount_Fuji_from_Yamanaka.jpg",
  },
  {
    id: "kamakura-coast",
    name: "鎌倉海岸（個人公開）",
    type: "個人カメラ",
    lat: 35.309,
    lon: 139.535,
    headingDeg: 180,
    fovDeg: 70,
    rangeM: 200,
    mediaType: "image",
    mediaUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6a/Yuigahama_Beach_Kamakura.jpg/640px-Yuigahama_Beach_Kamakura.jpg",
  },
  {
    id: "narita-road",
    name: "成田空港周辺道路",
    type: "道路カメラ",
    lat: 35.772,
    lon: 140.3929,
    headingDeg: 270,
    fovDeg: 55,
    rangeM: 180,
    mediaType: "image",
    mediaUrl:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Narita_International_Airport.jpg/640px-Narita_International_Airport.jpg",
  },
];

export const ORBIT_WINDOW_MINUTES = 45;
export const ORBIT_SAMPLE_MINUTES = 1;
export const IMAGING_ROI = { lat: 35.6812, lon: 139.7671, label: "東京" };

export const GROUND_PIN_COLORS = {
  video: "#fb923c",
  image: "#38bdf8",
} as const;
