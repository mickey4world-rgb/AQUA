/**
 * Azure 構成図用アイコンレジストリ。
 * PNG は Microsoft Azure Architecture Icons V19 から抽出（NOTICE 参照）。
 */

import { DOCS_AZURE_ICON_PNG } from "@/lib/server/docs-azure-icons-data";

export const DOCS_AZURE_SERVICE_IDS = [
  "app-service",
  "function-apps",
  "static-web-apps",
  "api-management",
  "front-door",
  "app-gateway",
  "load-balancer",
  "cosmos-db",
  "sql-database",
  "postgres",
  "storage",
  "key-vault",
  "entra-id",
  "users",
  "openai",
  "cognitive-services",
  "ai-studio",
  "aks",
  "container-apps",
  "container-instances",
  "container-registry",
  "vm",
  "vnet",
  "nsg",
  "subnet",
  "private-endpoint",
  "private-link",
  "bastion",
  "nat-gateway",
  "public-ip",
  "route-table",
  "vpn-gateway",
  "expressroute",
  "dns-zone",
  "firewall",
  "monitor",
  "app-insights",
  "log-analytics",
  "event-hubs",
  "service-bus",
  "logic-apps",
  "data-factory",
  "redis",
  "search",
  "cdn",
  "resource-group",
  "subscription",
] as const;

export type DocsAzureServiceId = (typeof DOCS_AZURE_SERVICE_IDS)[number];

const ALIASES: Record<string, DocsAzureServiceId> = {
  appservice: "app-service",
  webapp: "app-service",
  "web-app": "app-service",
  functions: "function-apps",
  function: "function-apps",
  "azure-functions": "function-apps",
  swa: "static-web-apps",
  "static-web-app": "static-web-apps",
  apim: "api-management",
  "api-management-services": "api-management",
  frontdoor: "front-door",
  afd: "front-door",
  "application-gateway": "app-gateway",
  agw: "app-gateway",
  lb: "load-balancer",
  cosmos: "cosmos-db",
  "cosmosdb": "cosmos-db",
  sql: "sql-database",
  "azure-sql": "sql-database",
  postgresql: "postgres",
  "azure-postgres": "postgres",
  blob: "storage",
  "storage-account": "storage",
  keyvault: "key-vault",
  kv: "key-vault",
  aad: "entra-id",
  "azure-ad": "entra-id",
  "active-directory": "entra-id",
  entra: "entra-id",
  "azure-openai": "openai",
  "openai-service": "openai",
  cognitive: "cognitive-services",
  "ai-services": "cognitive-services",
  foundry: "ai-studio",
  "azure-kubernetes": "aks",
  kubernetes: "aks",
  "container-app": "container-apps",
  aca: "container-apps",
  aci: "container-instances",
  acr: "container-registry",
  "virtual-machine": "vm",
  "virtual-network": "vnet",
  "network-security-group": "nsg",
  "network-security-groups": "nsg",
  "security-group": "nsg",
  "private-endpoints": "private-endpoint",
  pe: "private-endpoint",
  "private-link-service": "private-link",
  "azure-bastion": "bastion",
  nat: "nat-gateway",
  "azure-nat-gateway": "nat-gateway",
  pip: "public-ip",
  "public-ip-address": "public-ip",
  "route-tables": "route-table",
  "virtual-network-gateway": "vpn-gateway",
  "vnet-gateway": "vpn-gateway",
  "express-route": "expressroute",
  "dns-zones": "dns-zone",
  "private-dns-zone": "dns-zone",
  "azure-firewall": "firewall",
  "application-insights": "app-insights",
  "log-analytics-workspace": "log-analytics",
  eventhub: "event-hubs",
  "event-hub": "event-hubs",
  servicebus: "service-bus",
  "logic-app": "logic-apps",
  adf: "data-factory",
  "azure-cache-redis": "redis",
  "cognitive-search": "search",
  "ai-search": "search",
  "cdn-profile": "cdn",
  rg: "resource-group",
};

export const DOCS_AZURE_SERVICE_LABELS: Record<DocsAzureServiceId, string> = {
  "app-service": "App Service",
  "function-apps": "Functions",
  "static-web-apps": "Static Web Apps",
  "api-management": "API Management",
  "front-door": "Front Door",
  "app-gateway": "App Gateway",
  "load-balancer": "Load Balancer",
  "cosmos-db": "Cosmos DB",
  "sql-database": "SQL Database",
  postgres: "PostgreSQL",
  storage: "Storage",
  "key-vault": "Key Vault",
  "entra-id": "Entra ID",
  users: "Users",
  openai: "Azure OpenAI",
  "cognitive-services": "AI Services",
  "ai-studio": "AI Studio",
  aks: "AKS",
  "container-apps": "Container Apps",
  "container-instances": "Container Instances",
  "container-registry": "Container Registry",
  vm: "Virtual Machine",
  vnet: "Virtual Network",
  nsg: "NSG",
  subnet: "Subnet",
  "private-endpoint": "Private Endpoint",
  "private-link": "Private Link",
  bastion: "Bastion",
  "nat-gateway": "NAT Gateway",
  "public-ip": "Public IP",
  "route-table": "Route Table",
  "vpn-gateway": "VPN Gateway",
  expressroute: "ExpressRoute",
  "dns-zone": "DNS Zone",
  firewall: "Firewall",
  monitor: "Monitor",
  "app-insights": "App Insights",
  "log-analytics": "Log Analytics",
  "event-hubs": "Event Hubs",
  "service-bus": "Service Bus",
  "logic-apps": "Logic Apps",
  "data-factory": "Data Factory",
  redis: "Redis Cache",
  search: "AI Search",
  cdn: "CDN",
  "resource-group": "Resource Group",
  subscription: "Subscription",
};

export function isDocsAzureServiceId(value: string): value is DocsAzureServiceId {
  return (DOCS_AZURE_SERVICE_IDS as readonly string[]).includes(value);
}

/** AI / 自由入力を許可リストに正規化 */
export function normalizeAzureServiceId(raw: string): DocsAzureServiceId | null {
  const key = raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/_/g, "-");
  if (isDocsAzureServiceId(key)) return key;
  const alias = ALIASES[key.replace(/azure-/g, "")];
  if (alias) return alias;
  const compact = key.replace(/-/g, "");
  for (const [a, id] of Object.entries(ALIASES)) {
    if (a.replace(/-/g, "") === compact) return id;
  }
  return null;
}

export function getAzureIconPngBase64(service: string): string | null {
  const id = normalizeAzureServiceId(service);
  if (!id) return null;
  return DOCS_AZURE_ICON_PNG[id] ?? null;
}

export function listAzureServicesForPrompt(): string {
  return DOCS_AZURE_SERVICE_IDS.map(
    (id) => `${id}（${DOCS_AZURE_SERVICE_LABELS[id]}）`,
  ).join(", ");
}
