/**
 * 場中に VM 自動判断結果を見て、OTP・同期枯れ・LIVEゼロ受理をメール通知する。
 * 回復本体は VM SYSTEM タスク。ここは aquacore 側の閉ループ（検知→通知）。
 *
 * 反省（15日ゼロ約定）: autoTradeReady だけで return すると、
 * reject 連発や submitted=0 を「OK」と誤認する。準備OKでも LIVE 進捗を見る。
 */
import { getStockBrokerSnapshot } from "@/lib/server/stock-broker";
import { listRecentBrokerOrders } from "@/lib/server/stock-broker-trade";
import { sendNotifyEmail } from "@/lib/server/notify-email";
import { resolveUserNotifyEmail } from "@/lib/server/notify-recipients";
import { buildStockStationCheck } from "@/lib/stock-station-check";
import {
  isJpEquityMarketHours,
  jstSessionClock,
} from "@/lib/stock-jp-session";
import type { StockBrokerOrderRecord } from "@/lib/types/stock-broker-trade";

const COOLDOWN_MS = 90 * 60 * 1000;
const lastNotifyByUser = new Map<string, { at: number; kind: string }>();

export type StockOpsWatchResult = {
  userId: string;
  marketHours: boolean;
  autoTradeReady: boolean;
  recoveryStatus: string | null;
  notified: boolean;
  reason: string;
  liveSubmittedToday?: number;
  liveRejectedToday?: number;
};

function jstDayKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function isRealSymbol(symbol: string): boolean {
  return Boolean(symbol) && symbol !== "_CHECK_";
}

function todayLiveStats(orders: StockBrokerOrderRecord[], now: Date) {
  const day = jstDayKey(now);
  const today = orders.filter(
    (o) => jstDayKey(new Date(o.createdAt)) === day && isRealSymbol(o.symbol),
  );
  const submitted = today.filter((o) => o.status === "submitted");
  const rejected = today.filter((o) => o.status === "rejected");
  const rejectCodes = [
    ...new Set(
      rejected
        .map((o) => String(o.kabuResultCode ?? "?"))
        .filter((c) => c !== "?"),
    ),
  ];
  return {
    submitted: submitted.length,
    rejected: rejected.length,
    rejectCodes,
    lastReject: rejected[0],
  };
}

/**
 * 準備OKでも場中に LIVE 進捗が無い／拒否だけ続く → 通知対象。
 * 前場は 10:00 JST 以降、後場は開始直後から見る（ブラックアウト明け想定）。
 */
function detectLiveProgressAlert(
  stats: ReturnType<typeof todayLiveStats>,
  autoTradeReady: boolean,
  now: Date,
): { kind: string; subject: string; detail: string } | null {
  if (!autoTradeReady) return null;
  if (stats.submitted > 0) return null;

  const { mins } = jstSessionClock(now);
  const afterWarmup = mins >= 10 * 60; // 10:00 JST
  const afternoon = mins >= 12 * 60 + 30;

  if (stats.rejected >= 2) {
    const codes = stats.rejectCodes.join(",") || "unknown";
    return {
      kind: `reject-storm:${codes}`,
      subject: `[AQUA 株VM] LIVE拒否が続く (Code ${codes}) — 受理ゼロ`,
      detail: [
        `本日 LIVE submitted=0 / rejected=${stats.rejected}`,
        `Codes: ${codes}`,
        stats.lastReject?.message
          ? `直近: ${stats.lastReject.message.slice(0, 200)}`
          : "",
        "自動側: shape assert / FundType02 / Exchange27 / reject autofix 済み想定。",
        "残る場合: 余力(21)・同意書(100202)・未知Code。kabu-check と trade.log を確認。",
      ]
        .filter(Boolean)
        .join("\n"),
    };
  }

  if ((afterWarmup || afternoon) && stats.rejected === 0) {
    return {
      kind: "zero-submit-ready",
      subject: "[AQUA 株VM] 準備OKなのに本日 LIVE 受理ゼロ",
      detail: [
        "autoTradeReady=true だが本日 submitted=0（実銘柄）。",
        "想定: intents=0（条件見送り）か session ゲートか余力。",
        "buySkips / intents を Costs・trade.log で確認。ゼロ受理のまま閉じない。",
      ].join("\n"),
    };
  }

  return null;
}

export async function runStockOpsWatchForUser(
  userId: string,
  now = new Date(),
): Promise<StockOpsWatchResult> {
  const snapshot = await getStockBrokerSnapshot(userId);
  const orders = await listRecentBrokerOrders(userId, 80).catch(() => []);
  const check = buildStockStationCheck({ snapshot, orders, now });
  const marketHours = isJpEquityMarketHours(now);
  const recoveryStatus = snapshot?.bridgeMeta?.recoveryStatus ?? null;
  const stats = todayLiveStats(orders, now);

  const base = {
    userId,
    autoTradeReady: check.autoTradeReady,
    recoveryStatus,
    liveSubmittedToday: stats.submitted,
    liveRejectedToday: stats.rejected,
  };

  if (!marketHours) {
    return {
      ...base,
      marketHours: false,
      notified: false,
      reason: "場外のため監視スキップ",
    };
  }

  const needsOtp =
    recoveryStatus === "needs_otp" || check.needsInteractiveLogin;
  const syncBroken =
    check.items.find((i) => i.id === "sync")?.ok === false ||
    check.items.find((i) => i.id === "heartbeat")?.ok === false;

  const liveAlert = detectLiveProgressAlert(
    stats,
    check.autoTradeReady,
    now,
  );

  let subject: string | null = null;
  let detailExtra = "";
  let notifyKind = "";

  if (needsOtp) {
    subject = "[AQUA 株VM] 要OTP — 自動回復では復帰不可";
    notifyKind = "needs_otp";
  } else if (syncBroken) {
    subject = "[AQUA 株VM] 場中なのに同期/ティック停止疑い";
    notifyKind = "sync_broken";
  } else if (liveAlert) {
    subject = liveAlert.subject;
    detailExtra = liveAlert.detail;
    notifyKind = liveAlert.kind;
  } else if (check.autoTradeReady) {
    return {
      ...base,
      marketHours: true,
      notified: false,
      reason:
        stats.submitted > 0
          ? `自動売買準備OK・本日submitted=${stats.submitted}`
          : "自動売買準備OK（LIVE進捗はまだウォームアップ前）",
    };
  } else {
    return {
      ...base,
      marketHours: true,
      notified: false,
      reason: check.summary,
    };
  }

  const prev = lastNotifyByUser.get(userId);
  if (
    prev &&
    Date.now() - prev.at < COOLDOWN_MS &&
    prev.kind === notifyKind
  ) {
    return {
      ...base,
      marketHours: true,
      notified: false,
      reason: `通知クールダウン中 (${notifyKind})`,
    };
  }

  const to = await resolveUserNotifyEmail(userId);
  if (!to) {
    return {
      ...base,
      marketHours: true,
      notified: false,
      reason: "notifyEmail 未設定",
    };
  }

  const text = [
    "仕事場から aquacore だけ見ている前提の自動監視です。",
    "成功定義: LIVE submitted（実銘柄）。準備OKだけでは完了にしない。",
    "",
    `要約: ${check.summary}`,
    `recoveryStatus: ${recoveryStatus ?? "none"}`,
    `recoveryAction: ${snapshot?.bridgeMeta?.recoveryAction ?? "none"}`,
    `greenMark: ${check.greenMarkLabel}`,
    `autoTradeReady: ${check.autoTradeReady}`,
    `本日 LIVE submitted=${stats.submitted} rejected=${stats.rejected}`,
    stats.rejectCodes.length
      ? `rejectCodes: ${stats.rejectCodes.join(", ")}`
      : "",
    "",
    ...check.items.map(
      (i) =>
        `- ${i.label}: ${i.ok === true ? "OK" : i.ok === false ? "NG" : "?"} ${i.detail}`,
    ),
    "",
    detailExtra,
    "",
    needsOtp
      ? "対処: Tailscale → vm-kabu-aqua → ステーション OTP → kabu-check で緑確認"
      : syncBroken
        ? "対処: kabu-check / market-tick.log。続く場合は Verify-KabuOpsOnVm"
        : "対処: trade.log の shape / Code。余力・同意書は人手。ボディ毒は tick 前 Heal-CashOrderEnv が直す",
    "https://www.aquacore.net/costs/kabu-check",
  ]
    .filter((line) => line !== undefined)
    .join("\n");

  const result = await sendNotifyEmail({
    to,
    subject: subject!,
    text,
    category: "stock-ops",
  });

  if (result.ok) {
    lastNotifyByUser.set(userId, { at: Date.now(), kind: notifyKind });
  }

  return {
    ...base,
    marketHours: true,
    notified: Boolean(result.ok),
    reason: result.ok
      ? `通知送信 (${notifyKind})`
      : `通知失敗: ${result.reason}`,
  };
}
