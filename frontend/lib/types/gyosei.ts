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
  corpNumber?: string;
};

export type ExternalCompany = {
  name: string;
  corporateNumber: string;
  address: string;
  prefecture: string;
  city: string;
  inReviewData: boolean;
  reviewAmount: number;
};

export type NearbyMunicipalPayee = {
  municipality: string;
  payee: string;
  amount: number;
  projectCount: number;
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
