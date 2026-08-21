/**
 * 資産運用の裏稼働クロン（取引所接続・ブランド名は公開しない）。
 * POST /api/soluna/cron/asset-trade
 * Authorization: Bearer ${SOLUNA_CRON_SECRET}
 *
 * 朝のブリーフィング時刻に依存せず、目標達成まで監視・売買する。
 */
import { runAssetTradeTick, isBitFlyerEnabled } from "@/lib/server/soluna-asset-trade";
import { isSolunaSystemStorageConfigured } from "@/lib/server/soluna-system-store";

export const maxDuration = 60;

function authorizeCron(request: Request): boolean {
  const secret = process.env.SOLUNA_CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization")?.trim();
  if (header === `Bearer ${secret}`) return true;
  const alt = request.headers.get("x-soluna-cron-secret")?.trim();
  return alt === secret;
}

export async function POST(request: Request) {
  if (!authorizeCron(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isSolunaSystemStorageConfigured()) {
    return Response.json({ error: "Cosmos DB が未設定です。" }, { status: 503 });
  }

  if (!isBitFlyerEnabled()) {
    return Response.json({
      ok: true,
      skipped: true,
      reason: "BITFLYER_API_KEY / BITFLYER_API_SECRET 未設定",
    });
  }

  try {
    const assets = await runAssetTradeTick();
    return Response.json({
      ok: true,
      sleepMode: assets.sleepMode,
      battleMode: assets.battleMode,
      totalYen: assets.totalYen,
      btcPriceYen: assets.btcPriceYen,
      monthlyRealizedPnlYen: assets.monthlyRealizedPnlYen,
      monthlyTargetYen: assets.monthlyTargetYen,
      lastTrade: assets.trades[assets.trades.length - 1] ?? null,
      marketNote: assets.solComment,
      lunaComment: assets.lunaComment,
      updatedAt: assets.updatedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "asset trade failed";
    console.error("[cron/asset-trade]", message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
