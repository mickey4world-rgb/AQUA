import { withApiAccessLog } from "@/lib/server/api-access";
import { COUNCIL_DEPTH_CONFIG } from "@/lib/server/council-config";
import { getCouncilConfigMeta } from "@/lib/server/council-models";
import { isAzureOpenAiConfigured } from "@/lib/server/azure-openai";

export async function GET(request: Request) {
  return withApiAccessLog(request, async () => {
    const meta = getCouncilConfigMeta();
    return Response.json({
      ...meta,
      depths: COUNCIL_DEPTH_CONFIG,
      azureConfigured: isAzureOpenAiConfigured(),
    });
  });
}
