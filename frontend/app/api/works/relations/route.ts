import { withApiAccessLog } from "@/lib/server/api-access";
import {
  getDomesticDataRegionLabel,
  isDomesticJapanResidencyConfigured,
} from "@/lib/server/azure-openai";
import { isCosmosConfigured } from "@/lib/server/cosmos";
import { parseJsonBody } from "@/lib/server/security";
import {
  getRelationWorkspace,
  saveRelationWorkspace,
} from "@/lib/server/work-relations";
import type { RelationWorkspace } from "@/lib/types/work-relations";

function unavailable(message: string) {
  return Response.json({ error: "ServiceUnavailable", message }, { status: 503 });
}

export async function GET(request: Request) {
  if (!isCosmosConfigured()) {
    return unavailable("Cosmos DB が未設定です");
  }

  return withApiAccessLog(request, async (auth) => {
    const workspace = await getRelationWorkspace(auth.userId);
    return Response.json({
      workspace,
      residency: {
        domesticAiReady: isDomesticJapanResidencyConfigured(),
        dataRegionLabel: getDomesticDataRegionLabel(),
        policy:
          "関係データは Azure Cosmos DB、メモ解析 AI は日本リージョン Azure OpenAI のみ（海外・Gemini 不可）。",
      },
    });
  });
}

export async function PUT(request: Request) {
  if (!isCosmosConfigured()) {
    return unavailable("Cosmos DB が未設定です");
  }

  return withApiAccessLog(request, async (auth) => {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const body = parseJsonBody<{ workspace?: Partial<RelationWorkspace> }>(raw);
    if (!body?.workspace) {
      return Response.json({ error: "workspace が必要です" }, { status: 400 });
    }

    try {
      const workspace = await saveRelationWorkspace(auth.userId, body.workspace);
      return Response.json({ workspace });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "保存に失敗しました";
      const missingContainer =
        message.includes("NotFound") || message.includes("404");
      return Response.json(
        {
          error: missingContainer
            ? "WorkRelations コンテナが未作成です。npm run setup:work-relations を実行してください。"
            : "関係図の保存に失敗しました",
        },
        { status: missingContainer ? 503 : 500 },
      );
    }
  });
}
