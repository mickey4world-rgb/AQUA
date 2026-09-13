/**
 * クラウド構成図の領域（VNet/VPC 等）推論・正規化。
 * フラットなアイコン列ではなく、参照図のように境界枠で見せるための前処理。
 */

import type {
  DocCloudArchitecture,
  DocCloudArchNode,
  DocCloudArchZone,
  DocCloudArchZoneKind,
} from "@/lib/types/docs";
import type { DocsCloudProvider } from "@/lib/server/docs-cloud-costs";

/** 領域の「枠そのもの」になるサービス（ノード箱としては描かない） */
const AZURE_CHROME = new Set(["vnet", "subnet"]);
const AWS_CHROME = new Set(["vpc"]);

const AZURE_EDGE = new Set([
  "users",
  "front-door",
  "cdn",
  "expressroute",
  "public-ip",
]);
const AWS_EDGE = new Set([
  "users",
  "cloudfront",
  "route53",
  "internet-gateway",
  "direct-connect",
  "elastic-ip",
]);

const AZURE_MGMT = new Set([
  "entra-id",
  "monitor",
  "app-insights",
  "log-analytics",
  "resource-group",
  "subscription",
]);
const AWS_MGMT = new Set(["cloudwatch", "cognito", "users"]);

const AZURE_PRIVATE_DATA = new Set([
  "cosmos-db",
  "sql-database",
  "postgres",
  "storage",
  "key-vault",
  "openai",
  "search",
  "redis",
  "cognitive-services",
  "ai-studio",
]);
const AWS_PRIVATE_DATA = new Set([
  "dynamodb",
  "rds",
  "aurora",
  "s3",
  "secrets-manager",
  "kms",
  "bedrock",
  "opensearch",
  "elasticache",
]);

const AZURE_NET = new Set([
  "nsg",
  "nat-gateway",
  "bastion",
  "private-endpoint",
  "private-link",
  "route-table",
  "vpn-gateway",
  "firewall",
  "dns-zone",
]);
const AWS_NET = new Set([
  "nat-gateway",
  "nacl",
  "security-group",
  "vpc-endpoint",
  "privatelink",
  "transit-gateway",
  "site-to-site-vpn",
  "network-firewall",
]);

export function isChromeService(
  provider: DocsCloudProvider,
  service: string,
): boolean {
  return (provider === "aws" ? AWS_CHROME : AZURE_CHROME).has(service);
}

export function shouldUseZoneLayout(arch: DocCloudArchitecture): boolean {
  if (arch.zones && arch.zones.length > 0) return true;
  const set = arch.provider === "aws" ? AWS_NET : AZURE_NET;
  const chrome = arch.provider === "aws" ? AWS_CHROME : AZURE_CHROME;
  const hits = arch.nodes.filter(
    (n) => set.has(n.service) || chrome.has(n.service),
  ).length;
  return hits >= 2;
}

function classifyNode(
  provider: DocsCloudProvider,
  node: DocCloudArchNode,
): "chrome" | "edge" | "mgmt" | "private" | "net" | "app" {
  const s = node.service;
  if (isChromeService(provider, s)) return "chrome";
  if (provider === "aws") {
    if (AWS_EDGE.has(s)) return "edge";
    if (AWS_MGMT.has(s) && s !== "users") return "mgmt";
    if (AWS_PRIVATE_DATA.has(s)) return "private";
    if (AWS_NET.has(s)) return "net";
    return "app";
  }
  if (AZURE_EDGE.has(s)) return "edge";
  if (AZURE_MGMT.has(s)) return "mgmt";
  if (AZURE_PRIVATE_DATA.has(s)) return "private";
  if (AZURE_NET.has(s)) return "net";
  return "app";
}

function uniqueIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** AI 出力の zones を検証。不正なら空配列 */
export function parseCloudArchZones(
  raw: unknown,
  nodeIds: Set<string>,
): DocCloudArchZone[] {
  if (!Array.isArray(raw)) return [];
  const zones: DocCloudArchZone[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const z = row as Record<string, unknown>;
    const id = String(z.id ?? "")
      .trim()
      .replace(/[^\w\-]/g, "")
      .slice(0, 24);
    const label = String(z.label ?? "").trim().slice(0, 28);
    if (!id || !label || seen.has(id)) continue;
    const nodeIdList = Array.isArray(z.nodeIds)
      ? z.nodeIds
          .map((n) => String(n).trim())
          .filter((n) => nodeIds.has(n))
          .slice(0, 16)
      : [];
    const childZoneIds = Array.isArray(z.childZoneIds)
      ? z.childZoneIds
          .map((c) => String(c).trim())
          .filter(Boolean)
          .slice(0, 6)
      : undefined;
    const kindRaw = String(z.kind ?? "group");
    const kind = (
      [
        "edge",
        "vnet",
        "vpc",
        "subnet",
        "private",
        "mgmt",
        "group",
      ] as DocCloudArchZoneKind[]
    ).includes(kindRaw as DocCloudArchZoneKind)
      ? (kindRaw as DocCloudArchZoneKind)
      : "group";
    if (!nodeIdList.length && !(childZoneIds && childZoneIds.length)) continue;
    seen.add(id);
    zones.push({
      id,
      label,
      kind,
      nodeIds: uniqueIds(nodeIdList),
      childZoneIds: childZoneIds?.length ? uniqueIds(childZoneIds) : undefined,
    });
    if (zones.length >= 8) break;
  }
  return zones;
}

/** サービス種別から VNet/VPC 入れ子枠を推論（空成功禁止: 詳細時は枠が必ず見える） */
export function inferCloudArchZones(
  arch: DocCloudArchitecture,
): DocCloudArchZone[] {
  const provider = arch.provider === "aws" ? "aws" : "azure";
  const buckets: Record<
    "chrome" | "edge" | "mgmt" | "private" | "net" | "app",
    DocCloudArchNode[]
  > = {
    chrome: [],
    edge: [],
    mgmt: [],
    private: [],
    net: [],
    app: [],
  };
  for (const n of arch.nodes) {
    buckets[classifyNode(provider, n)].push(n);
  }

  const hasNetworkBoundary =
    buckets.chrome.length > 0 ||
    buckets.net.length > 0 ||
    (provider === "azure"
      ? arch.nodes.some((n) => n.service === "private-endpoint")
      : arch.nodes.some(
          (n) => n.service === "vpc-endpoint" || n.service === "privatelink",
        ));

  if (!hasNetworkBoundary) return [];

  const zones: DocCloudArchZone[] = [];
  if (buckets.edge.length) {
    zones.push({
      id: "edge",
      label: provider === "aws" ? "入口・配信" : "入口・外部",
      kind: "edge",
      nodeIds: buckets.edge.map((n) => n.id),
    });
  }

  const netKind: DocCloudArchZoneKind = provider === "aws" ? "vpc" : "vnet";
  const netLabel =
    provider === "aws" ? "仮想プライベートクラウド (VPC)" : "仮想ネットワーク (VNet)";

  const peNet = buckets.net.filter((n) =>
    provider === "aws"
      ? n.service === "vpc-endpoint" || n.service === "privatelink"
      : n.service === "private-endpoint" || n.service === "private-link",
  );
  const otherNet = buckets.net.filter((n) => !peNet.includes(n));
  const privateIds = [
    ...peNet.map((n) => n.id),
    ...buckets.private.map((n) => n.id),
  ];

  const vnetDirect = [
    ...buckets.app.map((n) => n.id),
    ...otherNet.map((n) => n.id),
  ];

  const childZoneIds: string[] = [];
  if (privateIds.length >= 1) {
    zones.push({
      id: "private",
      label: "Private Endpoint",
      kind: "private",
      nodeIds: uniqueIds(privateIds),
    });
    childZoneIds.push("private");
  }

  // VNet/VPC 枠は中身 or 子枠が無いと「箱」にならない → アプリを寄せる
  if (!vnetDirect.length && !childZoneIds.length && buckets.edge.length) {
    // 最低限: エッジ以外を中へ
    vnetDirect.push(
      ...arch.nodes
        .filter((n) => classifyNode(provider, n) === "app")
        .map((n) => n.id),
    );
  }

  zones.push({
    id: netKind,
    label: netLabel,
    kind: netKind,
    nodeIds: uniqueIds(vnetDirect),
    childZoneIds: childZoneIds.length ? childZoneIds : undefined,
  });

  if (buckets.mgmt.length) {
    zones.push({
      id: "mgmt",
      label: "共通基盤・運用",
      kind: "mgmt",
      nodeIds: buckets.mgmt.map((n) => n.id),
    });
  }

  // 孤児ノードを VNet 直下へ
  const placed = new Set<string>();
  for (const z of zones) {
    z.nodeIds.forEach((id) => placed.add(id));
  }
  const orphans = arch.nodes
    .filter((n) => !placed.has(n.id) && !isChromeService(provider, n.service))
    .map((n) => n.id);
  if (orphans.length) {
    const core = zones.find((z) => z.kind === "vnet" || z.kind === "vpc");
    if (core) core.nodeIds = uniqueIds([...core.nodeIds, ...orphans]);
  }

  return zones;
}

export function enrichCloudArchZones(
  arch: DocCloudArchitecture,
): DocCloudArchitecture {
  const nodeIds = new Set(arch.nodes.map((n) => n.id));
  let zones = (arch.zones ?? []).filter((z) => {
    const nodes = z.nodeIds.filter((id) => nodeIds.has(id));
    const children = (z.childZoneIds ?? []).filter(Boolean);
    return nodes.length > 0 || children.length > 0;
  });

  if (!zones.length && shouldUseZoneLayout(arch)) {
    zones = inferCloudArchZones(arch);
  }

  // 子参照の整合
  const zoneIds = new Set(zones.map((z) => z.id));
  zones = zones.map((z) => ({
    ...z,
    nodeIds: uniqueIds(z.nodeIds.filter((id) => nodeIds.has(id))),
    childZoneIds: z.childZoneIds?.filter((id) => zoneIds.has(id) && id !== z.id),
  }));

  return { ...arch, zones: zones.length ? zones : undefined };
}

export function diagramNodesForZoneLayout(
  arch: DocCloudArchitecture,
): DocCloudArchNode[] {
  const provider = arch.provider === "aws" ? "aws" : "azure";
  return arch.nodes.filter((n) => !isChromeService(provider, n.service));
}
