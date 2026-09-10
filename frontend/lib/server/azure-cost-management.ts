import {
  readAzureCostCache,
  writeCosmosAzureCostCache,
} from "@/lib/server/azure-cost-cache";
import { parseMonthParam } from "@/lib/server/token-usage";
import type { AzureInfraCostSummary } from "@/lib/types/analytics";

const COST_API = "2023-11-01";
const MANAGEMENT_SCOPE = "https://management.azure.com/";

const SERVICE_LABELS: Record<string, string> = {
  "Foundry Models": "Foundry Models（Marketplace）",
  "Azure Cosmos DB": "Cosmos DB",
  "Azure DNS": "DNS",
  Storage: "ストレージ",
  "Azure App Service": "App Service",
  "Static Web Apps": "Static Web Apps",
  "Key Vault": "Key Vault",
  "Log Analytics": "Application Insights",
  "Azure Monitor": "Azure Monitor",
  "Microsoft Defender for Cloud": "Defender for Cloud",
  Bandwidth: "帯域幅",
  "Virtual Network": "Virtual Network",
  "Azure Cognitive Search": "Cognitive Search",
  SaaS: "SaaS（Marketplace 課金）",
  "Microsoft.SaaS": "SaaS（Marketplace 課金）",
};

type CostQueryRow = {
  cost: number;
  serviceName?: string;
  resourceId?: string;
  usageDate?: number;
  currency: string;
};

type CostQueryResult = {
  columns: { name: string }[];
  rows: unknown[][];
};

const inflight = new Map<string, Promise<AzureInfraCostSummary | null>>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cacheKey(month: string, subscriptionId: string): string {
  const rg = process.env.AZURE_COST_RESOURCE_GROUP?.trim() ?? "";
  // v2: byResource を含む
  return `${subscriptionId}:${month}:${rg}:v2`;
}

function monthPeriod(monthDate: Date): { from: string; to: string } {
  const y = monthDate.getUTCFullYear();
  const m = monthDate.getUTCMonth();
  const from = new Date(Date.UTC(y, m, 1));
  const to = new Date(Date.UTC(y, m + 1, 0));
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

function usageDateToIso(value: number): string {
  const s = String(value);
  if (s.length !== 8) return s;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

function serviceLabel(name: string): string {
  return SERVICE_LABELS[name] ?? name;
}

function classifyResourceFocus(
  resourceId: string,
): "foundry-claude" | "azure-openai" | undefined {
  const id = resourceId.toLowerCase();
  if (id.includes("aqua-foundry-claude-prod")) return "foundry-claude";
  if (id.includes("openai-personal-apps-prod")) return "azure-openai";
  return undefined;
}

function resourceDisplayName(resourceId: string): string {
  const parts = resourceId.split("/").filter(Boolean);
  return parts[parts.length - 1] || resourceId;
}

function resourceLabel(
  resourceId: string,
  focus?: "foundry-claude" | "azure-openai",
): string {
  if (focus === "foundry-claude") return "Foundry Claude（Marketplace）";
  if (focus === "azure-openai") return "Azure OpenAI";
  return resourceDisplayName(resourceId);
}

export function isAzureCostManagementConfigured(): boolean {
  return Boolean(
    process.env.AZURE_SUBSCRIPTION_ID &&
      (hasServicePrincipalCredentials() || hasManagedIdentityEnv()),
  );
}

function hasServicePrincipalCredentials(): boolean {
  return Boolean(
    process.env.AZURE_TENANT_ID &&
      process.env.AZURE_CLIENT_ID &&
      process.env.AZURE_CLIENT_SECRET,
  );
}

function hasManagedIdentityEnv(): boolean {
  return Boolean(process.env.IDENTITY_ENDPOINT && process.env.IDENTITY_HEADER);
}

async function getManagementAccessToken(): Promise<string | null> {
  if (hasServicePrincipalCredentials()) {
    const tenantId = process.env.AZURE_TENANT_ID!;
    const res = await fetch(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: process.env.AZURE_CLIENT_ID!,
          client_secret: process.env.AZURE_CLIENT_SECRET!,
          scope: `${MANAGEMENT_SCOPE}.default`,
          grant_type: "client_credentials",
        }),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token?: string };
    return data.access_token ?? null;
  }

  if (hasManagedIdentityEnv()) {
    const url =
      `${process.env.IDENTITY_ENDPOINT}?api-version=2019-08-01` +
      `&resource=${encodeURIComponent(MANAGEMENT_SCOPE)}`;
    const res = await fetch(url, {
      headers: { "X-IDENTITY-HEADER": process.env.IDENTITY_HEADER! },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { access_token?: string };
    return data.access_token ?? null;
  }

  return null;
}

function parseCostValue(row: unknown[], index: Record<string, number>): number {
  const preTax = index.PreTaxCost ?? index.Cost;
  const raw = preTax != null ? row[preTax] : undefined;
  const value = Number(raw ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function parseRows(result: CostQueryResult): CostQueryRow[] {
  const index = Object.fromEntries(result.columns.map((col, i) => [col.name, i]));
  return result.rows.map((row) => ({
    cost: parseCostValue(row, index),
    serviceName:
      index.ServiceName != null
        ? (row[index.ServiceName] as string | undefined)
        : undefined,
    resourceId:
      index.ResourceId != null ? String(row[index.ResourceId] ?? "") : undefined,
    usageDate:
      index.UsageDate != null
        ? (row[index.UsageDate] as number | undefined)
        : undefined,
    currency: String(row[index.Currency] ?? "JPY"),
  }));
}

async function runCostQuery(
  token: string,
  subscriptionId: string,
  body: Record<string, unknown>,
): Promise<CostQueryRow[]> {
  const url =
    `https://management.azure.com/subscriptions/${subscriptionId}` +
    `/providers/Microsoft.CostManagement/query?api-version=${COST_API}`;

  let lastError = "Too many requests. Please retry.";

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (res.status === 429) {
      const retryAfterHeader = Number(res.headers.get("Retry-After"));
      const waitMs = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
        ? retryAfterHeader * 1000
        : Math.min(60_000, (attempt + 1) * 8000);
      lastError = await res.text();
      if (attempt < 4) {
        await sleep(waitMs);
        continue;
      }
      throw new Error(
        `Azure Cost Management query failed (429): ${lastError.slice(0, 200)}`,
      );
    }

    if (!res.ok) {
      const detail = await res.text();
      throw new Error(
        `Azure Cost Management query failed (${res.status}): ${detail.slice(0, 200)}`,
      );
    }

    const payload = (await res.json()) as { properties: CostQueryResult };
    return parseRows(payload.properties);
  }

  throw new Error(
    `Azure Cost Management query failed (429): ${lastError.slice(0, 200)}`,
  );
}

function resourceGroupFilter() {
  const rg = process.env.AZURE_COST_RESOURCE_GROUP?.trim();
  if (!rg) return undefined;
  return {
    dimensions: {
      name: "ResourceGroupName",
      operator: "In",
      values: [rg],
    },
  };
}

function buildSummaryFromRows(
  serviceRows: CostQueryRow[],
  resourceRows: CostQueryRow[],
  monthKey: string,
  subscriptionId: string,
  rgFilter: ReturnType<typeof resourceGroupFilter>,
): AzureInfraCostSummary {
  const currency = serviceRows[0]?.currency ?? resourceRows[0]?.currency ?? "JPY";
  const byServiceMap = new Map<string, number>();
  const dailyMap = new Map<string, number>();
  const byResourceMap = new Map<string, number>();

  for (const row of serviceRows) {
    if (row.serviceName) {
      byServiceMap.set(
        row.serviceName,
        (byServiceMap.get(row.serviceName) ?? 0) + row.cost,
      );
    }
    if (row.usageDate) {
      const date = usageDateToIso(row.usageDate);
      dailyMap.set(date, (dailyMap.get(date) ?? 0) + row.cost);
    }
  }

  for (const row of resourceRows) {
    if (!row.resourceId) continue;
    byResourceMap.set(
      row.resourceId,
      (byResourceMap.get(row.resourceId) ?? 0) + row.cost,
    );
  }

  const byServiceSorted = [...byServiceMap.entries()]
    .map(([service, costAmount]) => ({
      service,
      label: serviceLabel(service),
      costAmount,
    }))
    .sort((a, b) => b.costAmount - a.costAmount);

  const byResource = [...byResourceMap.entries()]
    .map(([resourceId, costAmount]) => {
      const focus = classifyResourceFocus(resourceId);
      return {
        resourceId,
        resourceName: resourceDisplayName(resourceId),
        label: resourceLabel(resourceId, focus),
        costAmount,
        focus,
      };
    })
    .sort((a, b) => {
      const rank = (focus?: string) =>
        focus === "foundry-claude" ? 0 : focus === "azure-openai" ? 1 : 2;
      const byFocus = rank(a.focus) - rank(b.focus);
      if (byFocus !== 0) return byFocus;
      return b.costAmount - a.costAmount;
    });

  const daily = [...dailyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, costAmount]) => ({ date, costAmount }));

  const totalCost = byServiceSorted.reduce((sum, row) => sum + row.costAmount, 0);
  const rgName = process.env.AZURE_COST_RESOURCE_GROUP?.trim();

  return {
    configured: true,
    month: monthKey,
    currency,
    totalCost,
    resourceGroupCost: rgFilter ? totalCost : undefined,
    byService: byServiceSorted,
    byResource,
    daily,
    scopeLabel: rgFilter && rgName ? `RG「${rgName}」` : "サブスクリプション全体",
    note: rgFilter
      ? `RG「${rgName}」内の実績コスト（税抜）。反映に 24〜48 時間かかることがあります。`
      : "Azure Cost Management の実績コスト（税抜）。反映に 24〜48 時間かかることがあります。",
  };
}

function unavailableSummary(
  monthKey: string,
  subscriptionId: string,
  message?: string,
): AzureInfraCostSummary {
  return {
    configured: true,
    month: monthKey,
    currency: "JPY",
    totalCost: 0,
    byService: [],
    byResource: [],
    daily: [],
    scopeLabel: subscriptionId,
    error: message,
    note: "Azure Cost Management は混雑時に取得できないことがあります。数分後に再読み込みしてください。",
  };
}

async function fetchAzureInfraCostsInternal(
  month?: string | null,
): Promise<AzureInfraCostSummary | null> {
  const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
  if (!subscriptionId || !isAzureCostManagementConfigured()) {
    return null;
  }

  const monthDate = parseMonthParam(month);
  const monthKey = `${monthDate.getUTCFullYear()}-${String(monthDate.getUTCMonth() + 1).padStart(2, "0")}`;
  const key = cacheKey(monthKey, subscriptionId);

  const cachedFresh = await readAzureCostCache(key, false);
  if (cachedFresh) return cachedFresh;

  const token = await getManagementAccessToken();
  if (!token) return null;

  const period = monthPeriod(monthDate);
  const rgFilter = resourceGroupFilter();

  try {
    const baseDataset = {
      aggregation: {
        totalCost: { name: "PreTaxCost", function: "Sum" },
      },
      ...(rgFilter ? { filter: rgFilter } : {}),
    };

    const [serviceRows, resourceRows] = await Promise.all([
      runCostQuery(token, subscriptionId, {
        type: "ActualCost",
        timeframe: "Custom",
        timePeriod: period,
        dataset: {
          ...baseDataset,
          granularity: "Daily",
          grouping: [{ type: "Dimension", name: "ServiceName" }],
        },
      }),
      runCostQuery(token, subscriptionId, {
        type: "ActualCost",
        timeframe: "Custom",
        timePeriod: period,
        dataset: {
          ...baseDataset,
          grouping: [{ type: "Dimension", name: "ResourceId" }],
        },
      }).catch((error) => {
        console.warn("[azure-cost] resource breakdown failed", error);
        return [] as CostQueryRow[];
      }),
    ]);

    const result = buildSummaryFromRows(
      serviceRows,
      resourceRows,
      monthKey,
      subscriptionId,
      rgFilter,
    );
    await writeCosmosAzureCostCache(key, result);
    return result;
  } catch (error) {
    const stale = await readAzureCostCache(key, true);
    if (stale) {
      return {
        ...stale,
        error: undefined,
        note: "Azure Cost Management が混雑中のため、保存済みのコストデータを表示しています。",
      };
    }

    return unavailableSummary(
      monthKey,
      subscriptionId,
      error instanceof Error ? error.message : "Azure Cost Management の取得に失敗しました",
    );
  }
}

export async function fetchAzureInfraCosts(
  month?: string | null,
): Promise<AzureInfraCostSummary | null> {
  const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
  if (!subscriptionId || !isAzureCostManagementConfigured()) {
    return null;
  }

  const monthDate = parseMonthParam(month);
  const monthKey = `${monthDate.getUTCFullYear()}-${String(monthDate.getUTCMonth() + 1).padStart(2, "0")}`;
  const key = cacheKey(monthKey, subscriptionId);

  const existing = inflight.get(key);
  if (existing) return existing;

  const task = fetchAzureInfraCostsInternal(month).finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, task);
  return task;
}
