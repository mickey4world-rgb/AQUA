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
