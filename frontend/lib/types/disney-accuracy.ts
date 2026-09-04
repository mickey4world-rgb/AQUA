import type { CrowdLevel, DisneyParkKey } from "@/lib/types/disney";

export type DisneyDayAccuracyRecord = {
  id: string;
  kind: "crowd-accuracy";
  park: DisneyParkKey;
  date: string;
  predictedLevel: CrowdLevel;
  predictedScore: number;
  actualLevel: CrowdLevel;
  actualScore: number;
  actualAverageWait: number;
  scoreDelta: number;
  levelHit: boolean;
  factors: string[];
  snapshotHours: number;
  createdAt: string;
  updatedAt: string;
};

export type DisneyCrowdAdjustmentRule = {
  id: string;
  reasonKey: string;
  label: string;
  /** 適用する月日レンジ（両端含む）。未指定なら通年 */
  from?: [number, number];
  to?: [number, number];
  /** 0=日 … 6=土。未指定なら全日 */
  daysOfWeek?: number[];
  parks?: DisneyParkKey[];
  scoreDelta: number;
  evidenceCount: number;
  sourceMonth: string;
  active: boolean;
  createdAt: string;
  note?: string;
};

export type DisneyCrowdAdjustmentsDoc = {
  id: "crowd-adjustments";
  kind: "crowd-adjustments";
  rules: DisneyCrowdAdjustmentRule[];
  updatedAt: string;
};

export type DisneyMonthlyReviewDoc = {
  id: string;
  kind: "crowd-monthly-review";
  month: string;
  parks: DisneyParkKey[];
  hitRate: number;
  evaluatedDays: number;
  hits: number;
  misses: number;
  meanAbsScoreError: number;
  topMissReasons: Array<{ reason: string; count: number }>;
  newsFindings: string[];
  rulesAdded: Array<{ label: string; scoreDelta: number }>;
  rulesUpdated: Array<{ label: string; scoreDelta: number }>;
  summary: string;
  createdAt: string;
};
