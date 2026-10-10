/**
 * 場中に VM 自動判断結果を見て、OTP 必要・同期枯れをメール通知する。
 * 回復本体は VM SYSTEM タスク。ここは aquacore 側の閉ループ（検知→通知）。
 */
import { getStockBrokerSnapshot } from "@/lib/server/stock-broker";
import { listRecentBrokerOrders } from "@/lib/server/stock-broker-trade";
import { sendNotifyEmail } from "@/lib/server/notify-email";
import { resolveUserNotifyEmail } from "@/lib/server/notify-recipients";
import { buildStockStationCheck } from "@/lib/stock-station-check";
import { isJpEquityMarketHours } from "@/lib/stock-jp-session";

const COOLDOWN_MS = 2 * 60 * 60 * 1000;
const lastNotifyByUser = new Map<string, number>();

export type StockOpsWatchResult = {
  userId: string;
  marketHours: boolean;
  autoTradeReady: boolean;
  recoveryStatus: string | null;
  notified: boolean;
  reason: string;
};

export async function runStockOpsWatchForUser(
  userId: string,
  now = new Date(),
): Promise<StockOpsWatchResult> {
  const snapshot = await getStockBrokerSnapshot(userId);
  const orders = await listRecentBrokerOrders(userId, 40).catch(() => []);
  const check = buildStockStationCheck({ snapshot, orders, now });
  const marketHours = isJpEquityMarketHours(now);
  const recoveryStatus = snapshot?.bridgeMeta?.recoveryStatus ?? null;

  if (!marketHours) {
    return {
      userId,
      marketHours: false,
      autoTradeReady: check.autoTradeReady,
      recoveryStatus,
      notified: false,
      reason: "場外のため監視スキップ",
    };
  }

  if (check.autoTradeReady) {
    return {
      userId,
      marketHours: true,
      autoTradeReady: true,
      recoveryStatus,
      notified: false,
      reason: "自動売買準備OK",
    };
  }

  const needsOtp =
    recoveryStatus === "needs_otp" || check.needsInteractiveLogin;
  const syncBroken =
    check.items.find((i) => i.id === "sync")?.ok === false ||
    check.items.find((i) => i.id === "heartbeat")?.ok === false;

  if (!needsOtp && !syncBroken) {
    return {
      userId,
      marketHours: true,
      autoTradeReady: false,
      recoveryStatus,
      notified: false,
      reason: check.summary,
    };
  }

  const last = lastNotifyByUser.get(userId) ?? 0;
  if (Date.now() - last < COOLDOWN_MS) {
    return {
      userId,
      marketHours: true,
      autoTradeReady: false,
      recoveryStatus,
      notified: false,
      reason: "通知クールダウン中",
    };
  }

  const to = await resolveUserNotifyEmail(userId);
  if (!to) {
    return {
      userId,
      marketHours: true,
      autoTradeReady: false,
      recoveryStatus,
      notified: false,
      reason: "notifyEmail 未設定",
    };
  }

  const subject = needsOtp
    ? "[AQUA 株VM] 要OTP — 自動回復では復帰不可"
    : "[AQUA 株VM] 場中なのに同期/ティック停止疑い";
  const text = [
    "仕事場から aquacore だけ見ている前提の自動監視です。",
    "",
    `要約: ${check.summary}`,
    `recoveryStatus: ${recoveryStatus ?? "none"}`,
    `recoveryAction: ${snapshot?.bridgeMeta?.recoveryAction ?? "none"}`,
    `greenMark: ${check.greenMarkLabel}`,
    `autoTradeReady: ${check.autoTradeReady}`,
    "",
    ...check.items.map((i) => `- ${i.label}: ${i.ok === true ? "OK" : i.ok === false ? "NG" : "?"} ${i.detail}`),
    "",
    needsOtp
      ? "対処: Tailscale → vm-kabu-aqua → ステーション OTP → kabu-check で緑確認"
      : "対処: kabu-check を確認。続く場合は Verify-KabuOpsOnVm / market-tick.log",
    "https://www.aquacore.net/costs/kabu-check",
  ].join("\n");

  const result = await sendNotifyEmail({
    to,
    subject,
    text,
    category: "stock-ops",
  });

  if (result.ok) {
    lastNotifyByUser.set(userId, Date.now());
  }

  return {
    userId,
    marketHours: true,
    autoTradeReady: false,
    recoveryStatus,
    notified: Boolean(result.ok),
    reason: result.ok ? "通知送信" : `通知失敗: ${result.reason}`,
  };
}
