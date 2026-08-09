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

export type MoneyFlowFilters = {
  year: number;
  ministry?: string;
  payee?: string;
  limit?: number;
};

export type MoneyFlowNode = {
  id: string;
  label: string;
  kind: "government" | "ministry" | "project" | "payee";
  amount: number;
};

export type MoneyFlowLink = {
  source: string;
  target: string;
  amount: number;
};

export type MoneyFlowResponse = {
  year: number;
  unit: string;
  filters: {
    ministry: string | null;
    payee: string | null;
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
  rows: Array<{
    ministry: string;
    project: string;
    projectNumber: string;
    payee: string;
    amount: number;
    block: string;
    contract: string | null;
    work: string;
  }>;
  source: GyoseiSource;
  availableYears: number[];
  ministries: string[];
};
