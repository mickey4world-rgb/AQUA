export type GyoseiSource = {
  label: string;
  publisher: string;
  license: string;
  url: string;
};

export type GyoseiYearDataset = {
  fiscalYear: number;
  source: GyoseiSource;
  unit: string;
  dictionaries: {
    ministries: string[];
    bureaus: string[];
    payees: string[];
    contracts: string[];
  };
  projectFields: string[];
  flowFields: string[];
  /** [ministry, name, bureau, execution, budget, number, suspect] */
  projects: Array<[number, string, number, number, number, string, number]>;
  /** [project, payee, amount, block, contract, corpNumber, work] */
  flows: Array<[number, number, number, string, number, string, string]>;
};

export type GyoseiSummaryMinistry = {
  name: string;
  amount: number;
  projectCount: number;
  topPayees: Array<{ name: string; amount: number }>;
};

export type GyoseiSummaryYear = {
  fiscalYear: number;
  total: number;
  excluded: number;
  projectCount: number;
  flowCount: number;
  suspectCount: number;
  ministries: GyoseiSummaryMinistry[];
};

export type GyoseiSummary = {
  unit: string;
  source: GyoseiSource;
  years: GyoseiSummaryYear[];
  topPayees: Array<{ name: string; amount: number; years: number[] }>;
};

export type MoneyFlowFocusKind = "ministry" | "project" | "payee" | "block";

export type MoneyFlowFilters = {
  year: number;
  ministry?: string;
  payee?: string;
  sector?: string;
  focusKind?: MoneyFlowFocusKind;
  focusValue?: string;
  limit?: number;
};

export type MoneyFlowNode = {
  id: string;
  label: string;
  /** ドリルダウン用の完全な名前（省略なし） */
  rawLabel?: string;
  kind: "government" | "ministry" | "project" | "payee" | "block" | "year";
  amount: number;
  drillable?: boolean;
};

export type MoneyFlowLink = {
  source: string;
  target: string;
  amount: number;
};

export type MoneyFlowRow = {
  ministry: string;
  project: string;
  projectNumber: string;
  payee: string;
  amount: number;
  block: string;
  contract: string | null;
  work: string;
  address?: string;
  corpNumber?: string;
  /** 支出先集計行のとき true */
  aggregated?: boolean;
  flowCount?: number;
};

export type ExternalCompany = {
  name: string;
  corporateNumber: string;
  address: string;
  prefecture: string;
  city: string;
  inReviewData: boolean;
  reviewAmount: number;
  addressSource?: "review" | "openstreetmap" | "houjin";
};

export type NearbyMunicipalPayee = {
  municipality: string;
  /** 同一事業などで周辺自治体（支出先）が受けた国からの額 */
  municipalityAmount: number;
  /** 同一事業で当該業者が受けた額 */
  vendorAmount: number;
  vendor: string;
  projectCount: number;
  topProjects: string[];
  relation: "same-project" | "work-mention";
};

export type PayeeYearPoint = {
  fiscalYear: number;
  amount: number;
  projectCount: number;
  contractCount: number;
};

export type PayeeContractPartner = {
  ministry: string;
  amount: number;
  projectCount: number;
};

export type PayeeRecentContract = {
  fiscalYear: number;
  ministry: string;
  project: string;
  amount: number;
  contract: string | null;
  work: string;
};

export type PayeeIssue = {
  level: "info" | "watch" | "caution";
  title: string;
  detail: string;
};

export type PayeeDossier = {
  name: string;
  corporateNumber: string;
  address: string;
  unit: string;
  years: PayeeYearPoint[];
  totalAmount: number;
  trend: {
    label: "拡大" | "横ばい" | "縮小" | "データ不足";
    changeRate: number | null;
    summary: string;
  };
  procurement: {
    verdict: "問題なさそう" | "注意して確認" | "慎重に判断" | "判断材料不足";
    summary: string;
  };
  issues: PayeeIssue[];
  partners: PayeeContractPartner[];
  recentContracts: PayeeRecentContract[];
  contractMix: Array<{ method: string; amount: number; share: number }>;
  soleSourceShare: number | null;
  suspensions?: Array<{
    date: string;
    agency: string;
    company: string;
    address: string;
    type: string;
    overviewUrl: string | null;
    detailUrl: string | null;
  }>;
  reputation?: {
    japanTitle: string | null;
    japanSummary: string | null;
    japanUrl: string | null;
    worldTitle: string | null;
    worldSummary: string | null;
    worldUrl: string | null;
    notes: string[];
  };
  finance?: {
    symbol: string | null;
    exchange: string | null;
    currency: string | null;
    lastPrice: number | null;
    change5yPct: number | null;
    drawdownFromPeakPct: number | null;
    summary: string;
    concern: boolean;
  };
};

export type MoneyFlowResponse = {
  year: number;
  unit: string;
  filters: {
    ministry: string | null;
    payee: string | null;
    sector: string | null;
    focusKind: MoneyFlowFocusKind | null;
    focusValue: string | null;
  };
  totals: {
    amount: number;
    projectCount: number;
    payeeCount: number;
    flowCount: number;
    truncated: boolean;
  };
  nodes: MoneyFlowNode[];
  links: MoneyFlowLink[];
  rows: MoneyFlowRow[];
  source: GyoseiSource;
  availableYears: number[];
  pendingYears: number[];
  ministries: string[];
  sectors: Array<{ id: string; label: string }>;
  externalCompanies: ExternalCompany[];
  nearbyMunicipal: NearbyMunicipalPayee[];
  houjinEnabled: boolean;
  yearAvailable: boolean;
  message?: string;
};
