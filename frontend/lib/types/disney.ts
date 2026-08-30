export type DisneyParkKey = "tdl" | "tds";

export type CrowdLevel = "low" | "moderate" | "high" | "extreme";

export interface AttractionWait {
  id: string;
  name: string;
  nameJa?: string;
  waitTime: number | null;
  status: string;
  isPopular: boolean;
  lastUpdated: string;
}

export interface ParkCrowdStatus {
  park: DisneyParkKey;
  parkName: string;
  crowdLevel: CrowdLevel;
  crowdLabel: string;
  averageWait: number;
  medianWait: number;
  operatingCount: number;
  highWaitCount: number;
  extremeWaitCount: number;
  fetchedAt: string;
  isOpen: boolean;
  openingTime?: string;
  closingTime?: string;
}

export interface DisneyResortStatus {
  tdl: ParkCrowdStatus;
  tds: ParkCrowdStatus;
  overallCrowdLevel: CrowdLevel;
  overallLabel: string;
  fetchedAt: string;
}

export interface TouringRecommendation {
  priority: "now" | "soon" | "later" | "skip";
  attraction: AttractionWait;
  reason: string;
}

export interface DisneyAdvice {
  park: DisneyParkKey;
  parkName: string;
  crowdLevel: CrowdLevel;
  timeAdvice: string[];
  seasonalAdvice: string[];
  touringPlan: TouringRecommendation[];
  summary: string;
  fetchedAt: string;
  targetDate?: string;
  prediction?: DisneyDatePrediction;
  breakdown?: DisneyCrowdBreakdown;
  aiInsight?: DisneyAiInsight;
}

export interface DisneyAiInsight {
  available: boolean;
  model?: string;
  headline?: string;
  commentary?: string;
  recommendedRoute?: string[];
  timingTips?: string[];
  crowdStrategy?: string;
  confidence?: "high" | "medium" | "low";
  generatedAt?: string;
  reason?: string;
}

export interface DisneyDatePrediction {
  date: string;
  park: DisneyParkKey;
  parkName: string;
  crowdLevel: CrowdLevel;
  crowdLabel: string;
  crowdScore: number;
  estimatedWait: number;
  factors: string[];
  description: string;
  visitTips: string[];
  isToday: boolean;
  isPast: boolean;
  isFuture: boolean;
  mode: "live" | "forecast";
}

export interface DisneyCalendarDay {
  date: string;
  crowdLevel: CrowdLevel;
  crowdLabel: string;
  crowdScore: number;
  estimatedWait: number;
  isToday: boolean;
  isPast: boolean;
  isFuture: boolean;
  factors: string[];
  breakdown: DisneyCrowdBreakdown;
}

/** 混雑要因の数値内訳（0〜100、高いほど混雑寄り） */
export interface DisneyCrowdBreakdown {
  calendar: number;
  seasonal: number;
  weather: number;
  event: number;
  newsBuzz: number;
  merchandise: number;
  historical: number;
  total: number;
  labels: {
    calendar: string;
    seasonal: string;
    weather: string;
    event: string;
    newsBuzz: string;
    merchandise: string;
    historical: string;
  };
}

export type AttractionCrowdBand = "empty" | "moderate" | "busy" | "extreme";

export interface AttractionHourSlot {
  hour: number;
  label: string;
  waitMinutes: number;
  band: AttractionCrowdBand;
}

export interface AttractionDayForecast {
  id: string;
  name: string;
  nameJa: string;
  isPopular: boolean;
  slots: AttractionHourSlot[];
  bestHours: number[];
  worstHours: number[];
}

export interface DisneyDayForecast {
  park: DisneyParkKey;
  parkName: string;
  date: string;
  mode: "live" | "forecast";
  hours: number[];
  hourLabels: string[];
  attractions: AttractionDayForecast[];
  summary: {
    quietestHour: number;
    busiestHour: number;
    quietestLabel: string;
    busiestLabel: string;
  };
  generatedAt: string;
}

export interface DisneyCharacterEveningAdvice {
  park: DisneyParkKey;
  parkName: string;
  targetDate: string;
  characterId: "baymax" | "elsa";
  characterNameJa: string;
  headline: string;
  crowdReasons: string[];
  cautions: string[];
  touringTips: string[];
  breakdown: DisneyCrowdBreakdown;
  crowdLevel: CrowdLevel;
  crowdScore: number;
  generatedAt: string;
  mode: "evening" | "preview";
}

export interface DisneyShowcaseSnapshot {
  generatedAt: string;
  today: string;
  tomorrow: string;
  tdl: {
    calendar: DisneyCalendarDay[];
    eveningAdvice: DisneyCharacterEveningAdvice;
    todayForecast: DisneyDayForecast;
  };
  tds: {
    calendar: DisneyCalendarDay[];
    eveningAdvice: DisneyCharacterEveningAdvice;
    todayForecast: DisneyDayForecast;
  };
}

export interface DisneyCalendarMonth {
  park: DisneyParkKey;
  year: number;
  month: number;
  monthLabel: string;
  startWeekday: number;
  days: DisneyCalendarDay[];
  today: string;
}

export type DisneyChatMessage = {
  role: "user" | "assistant";
  content: string;
};
