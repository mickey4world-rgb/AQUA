import { sendNotifyEmail } from "@/lib/server/notify-email";
import { resolveUserNotifyEmail } from "@/lib/server/notify-recipients";
import { updateStockWatch } from "@/lib/server/stock-watches";
import { displayTicker, formatPrice } from "@/lib/stock-utils";
import type { StockAdvice, StockWatch } from "@/lib/types/stock";

const ALERT_COOLDOWN_MS = 12 * 60 * 60 * 1000;

function shouldNotifySell(watch: StockWatch, advice: StockAdvice): boolean {
  if (advice.action !== "sell") return false;
  // 目標到達・近接・損切り候補など「売り検討」になったとき
  const lastAt = watch.lastNotifyAt ? Date.parse(watch.lastNotifyAt) : 0;
  if (
    watch.lastNotifyAction === "sell" &&
    Number.isFinite(lastAt) &&
    Date.now() - lastAt < ALERT_COOLDOWN_MS
  ) {
    return false;
  }
  return true;
}

/** 保有株の売り検討アラートを notifyEmail へ送る（失敗しても呼び出し側は継続） */
export async function maybeNotifyStockSellAdvice(
  watch: StockWatch,
  advice: StockAdvice,
): Promise<void> {
  if (!shouldNotifySell(watch, advice)) return;

  const to = await resolveUserNotifyEmail(watch.userId);
  if (!to) return;

  const market = advice.market ?? watch.market ?? "us";
  const ticker = displayTicker(watch.ticker, market);
  const name = advice.companyName ?? watch.name ?? ticker;
  const subject = `[AQUA 保有株] 売り検討 ${ticker} ${formatPrice(advice.currentPrice, market)}`;
  const text = [
    `保有株ウォッチで売り検討の判定になりました。`,
    ``,
    `銘柄: ${name} (${ticker})`,
    `現在値: ${formatPrice(advice.currentPrice, market)}`,
    `取得単価: ${formatPrice(advice.buyPrice, market)}`,
    `目標株価: ${formatPrice(advice.targetPrice, market)}`,
    `損益: ${advice.profitPct >= 0 ? "+" : ""}${advice.profitPct.toFixed(1)}%`,
    `目標まで: ${advice.distanceToTargetPct.toFixed(1)}%`,
    ``,
    advice.summary,
    ...advice.reasons.map((r) => `・${r}`),
    ``,
    `通知先: ユーザー設定の notifyEmail`,
  ].join("\n");

  const result = await sendNotifyEmail({
    to,
    subject,
    text,
    category: "stock-alert",
  });

  if (!result.ok) {
    console.warn("[stock-notify] email not sent:", result.reason);
    return;
  }

  await updateStockWatch(watch.userId, watch.id, {
    lastNotifyAction: "sell",
    lastNotifyAt: new Date().toISOString(),
  }).catch((error) => {
    console.warn("[stock-notify] failed to persist lastNotifyAt", error);
  });
}
