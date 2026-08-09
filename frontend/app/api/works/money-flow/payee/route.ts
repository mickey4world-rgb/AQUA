import { withApiAccessLog } from "@/lib/server/api-access";
import { buildPayeeDossier } from "@/lib/server/payee-dossier";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return withApiAccessLog(request, async () => {
    try {
      const { searchParams } = new URL(request.url);
      const name = searchParams.get("name")?.trim() || "";
      if (!name) {
        return Response.json({ error: "name が必要です。" }, { status: 400 });
      }
      const dossier = buildPayeeDossier(name);
      if (!dossier) {
        return Response.json({ error: "支出先を特定できませんでした。" }, { status: 404 });
      }
      return Response.json(dossier);
    } catch (error) {
      console.error("[money-flow/payee]", error);
      return Response.json(
        { error: "支出先詳細の取得に失敗しました。" },
        { status: 500 },
      );
    }
  });
}
