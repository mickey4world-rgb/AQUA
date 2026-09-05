/** 衛星名・カテゴリから運用国／機関を推定（一覧・ラベル表示用） */

export type SatelliteCountryInfo = {
  country: string;
  countryCode: string;
};

const NAME_RULES: Array<{ pattern: RegExp; country: string; countryCode: string }> = [
  { pattern: /\bISS\b|ZARYA|TIANHE|CSS\b/i, country: "国際", countryCode: "INT" },
  { pattern: /\bNOAA|GOES|LANDSAT|TERRA\b|AQUA\b|SUOMI|NPP\b|JPSS|GPS\b|NAVSTAR|STARLINK|SKYNET|WORLDVIEW|SKYSAT|PLANETSCOPE|HUBBLE|TDRS/i, country: "アメリカ", countryCode: "US" },
  { pattern: /\bHIMAWARI|ALOS|QZSS|MICHIBIKI|ASNARO|IBUKI|GOSAT|DAICHI|KIZUNA|KIRAMEKI|JAXA/i, country: "日本", countryCode: "JP" },
  { pattern: /\bSENTINEL|METEOSAT|GALILEO|ENVISAT|ERS-|COPERNICUS|EUTELSAT|SPOT\b|PLEIADES/i, country: "欧州", countryCode: "EU" },
  { pattern: /\bGLONASS|COSMOS|RESURS|METEOR|KANOPUS|YAMAL|EXPRESS|LUCH\b/i, country: "ロシア", countryCode: "RU" },
  { pattern: /\bBEIDOU|FENGYUN|YAOGAN|GAOFEN|ZIYUAN|TIANHUI|JILIN|WUKONG|CHANG.?E/i, country: "中国", countryCode: "CN" },
  { pattern: /\bCARTOSAT|INSAT|RISAT|GSAT|IRNSS|NAVIC|RESOURCESAT/i, country: "インド", countryCode: "IN" },
  { pattern: /\bKOMPSAT|CHEOLLIAN|MULAN|CAS500|NARO/i, country: "韓国", countryCode: "KR" },
  { pattern: /\bONEWEB|SKYNET.?5|DMC\b/i, country: "イギリス", countryCode: "GB" },
  { pattern: /\bRADARSAT|SCISAT|NEOSSAT/i, country: "カナダ", countryCode: "CA" },
  { pattern: /\bTHAICHOTE|THEOS/i, country: "タイ", countryCode: "TH" },
  { pattern: /\bTURKSAT|GOKTURK/i, country: "トルコ", countryCode: "TR" },
  { pattern: /\bNIGERIASAT|NIGCOMSAT/i, country: "ナイジェリア", countryCode: "NG" },
  { pattern: /\bAUSSAT|OPTUS|NBNCO/i, country: "オーストラリア", countryCode: "AU" },
  { pattern: /\bARABSAT|SHARJAH/i, country: "中東", countryCode: "ME" },
  { pattern: /\bTELECOM|ASTRA\b|HELIOS/i, country: "欧州", countryCode: "EU" },
];

const CATEGORY_DEFAULTS: Record<string, SatelliteCountryInfo> = {
  "gps-ops": { country: "アメリカ", countryCode: "US" },
  galileo: { country: "欧州", countryCode: "EU" },
  weather: { country: "アメリカ", countryCode: "US" },
  stations: { country: "国際", countryCode: "INT" },
  resource: { country: "アメリカ", countryCode: "US" },
  science: { country: "国際", countryCode: "INT" },
  visual: { country: "国際", countryCode: "INT" },
};

export function inferSatelliteCountry(
  name: string,
  category?: string,
): SatelliteCountryInfo {
  for (const rule of NAME_RULES) {
    if (rule.pattern.test(name)) {
      return { country: rule.country, countryCode: rule.countryCode };
    }
  }
  if (category && CATEGORY_DEFAULTS[category]) {
    return CATEGORY_DEFAULTS[category];
  }
  return { country: "不明", countryCode: "XX" };
}

export function formatSatelliteCountryLabel(info: SatelliteCountryInfo): string {
  return `${info.country}（${info.countryCode}）`;
}
