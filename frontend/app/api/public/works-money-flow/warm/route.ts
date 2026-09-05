import { warmWorksMoneyFlowPublicPreview } from "@/lib/server/gyosei-public-preview";
import { recordSecurityEvent } from "@/lib/server/security-event";
import { COSMOS_CONTAINERS, getContainer, isCosmosConfigured } from "@/lib/server/cosmos";
import type { MoneyFlowResponse } from "@/lib/types/gyosei";

export const maxDuration = 120;

function authorizeCron(request: Request): boolean {
  const secret = process.env.SOLUNA_CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization")?.trim();
  if (header === `Bearer ${secret}`) return true;
  return request.headers.get("x-soluna-cron-secret")?.trim() === secret;
}

type WarmBody = {
  snapshot?: MoneyFlowResponse;
};

/** バッチ専用: 事前生成スナップショットを受け取るか、可能なら再生成して保存 */
export async function POST(request: Request) {
  if (!authorizeCron(request)) {
    await recordSecurityEvent({
      request,
      eventType: "automation_auth_denied",
      severity: "high",
      statusCode: 401,
      attackLabel: "公開サンキー更新APIへの不正アクセス",
      reason: "有効な自動タスク秘密情報なし",
      mitigation: "専用Bearer秘密情報の照合で遮断",
    });
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let body: WarmBody = {};
    try {
      body = (await request.json()) as WarmBody;
    } catch {
      body = {};
    }

    if (body.snapshot?.year && Array.isArray(body.snapshot.nodes)) {
      if (isCosmosConfigured()) {
        const container = getContainer(COSMOS_CONTAINERS.disneyRecords);
        await container.items.upsert({
          id: "works-money-flow-public-preview",
          year: body.snapshot.year,
          snapshot: body.snapshot,
          builtAt: new Date().toISOString(),
        });
      }
      return Response.json({
        ok: true,
        year: body.snapshot.year,
        builtAt: new Date().toISOString(),
        source: "uploaded",
      });
    }

    const result = await warmWorksMoneyFlowPublicPreview();
    return Response.json({ ok: true, ...result });
  } catch (error) {
    console.error("[works-money-flow/warm]", error);
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "warm failed",
      },
      { status: 503 },
    );
  }
}
