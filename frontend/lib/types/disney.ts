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
  estimatedWait: number;
  isToday: boolean;
  isPast: boolean;
  isFuture: boolean;
  factors: string[];
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
