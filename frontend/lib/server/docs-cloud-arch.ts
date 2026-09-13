import type { DocCloudArchitecture, DocCloudArchNode } from "@/lib/types/docs";
import {
  costHintFor,
  estimateNodeMonthlyJpy,
  formatYen,
  sumMonthlyJpy,
  type DocsCloudProvider,
} from "@/lib/server/docs-cloud-costs";
import {
  DOCS_AZURE_SERVICE_LABELS,
  getAzureIconPngBase64,
  normalizeAzureServiceId,
} from "@/lib/server/docs-azure-icons";
import {
  DOCS_AWS_SERVICE_LABELS,
  getAwsIconPngBase64,
  normalizeAwsServiceId,
} from "@/lib/server/docs-aws-icons";

export function getSlideCloudArch(slide: {
  cloudArch?: DocCloudArchitecture;
  azureArch?: DocCloudArchitecture;
}): DocCloudArchitecture | undefined {
  const raw = slide.cloudArch ?? slide.azureArch;
  if (!raw || raw.nodes.length < 3) return undefined;
  return enrichCloudArchCosts(raw);
}

export function enrichCloudArchCosts(arch: DocCloudArchitecture): DocCloudArchitecture {
  const provider: DocsCloudProvider =
    arch.provider === "aws" ? "aws" : "azure";
  const nodes: DocCloudArchNode[] = arch.nodes.map((n) => {
    const service =
      provider === "aws"
        ? normalizeAwsServiceId(n.service) ?? n.service
        : normalizeAzureServiceId(n.service) ?? n.service;
    return {
      ...n,
      service,
      monthlyCostJpy: estimateNodeMonthlyJpy(
        provider,
        service,
        n.monthlyCostJpy,
      ),
    };
  });
  return {
    ...arch,
    provider,
    nodes,
    totalMonthlyJpy: sumMonthlyJpy(nodes.map((n) => n.monthlyCostJpy ?? 0)),
    costNote:
      arch.costNote ??
      "月額は小〜中規模の想定概算（税別・為替・予約割引未反映）。正式見積ではありません。",
  };
}

export function cloudServiceDisplayName(
  provider: DocsCloudProvider,
  service: string,
): string {
  if (provider === "aws") {
    const id = normalizeAwsServiceId(service);
    return (id && DOCS_AWS_SERVICE_LABELS[id]) || service;
  }
  const id = normalizeAzureServiceId(service);
  return (id && DOCS_AZURE_SERVICE_LABELS[id]) || service;
}

export function getCloudIconPngBase64(
  provider: DocsCloudProvider,
  service: string,
): string | null {
  return provider === "aws"
    ? getAwsIconPngBase64(service)
    : getAzureIconPngBase64(service);
}

export function formatArchTotal(arch: DocCloudArchitecture): string {
  const total = arch.totalMonthlyJpy ?? 0;
  return formatYen(total);
}

export { formatYen, costHintFor };
