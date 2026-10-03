/**
 * kabu Azure VM の稼働推定（sync / 点検ハートビートから）。
 * 直接の VM API は無いので「最終同期・最終 trade/点検」で表現する。
 */
import type { StockBrokerSnapshot } from "@/lib/types/stock-broker";
import type { StockBrokerOrderRecord } from "@/lib/types/stock-broker-trade";
import {
  STOCK_SESSION_CLOSE_BLACKOUT_MIN,
  STOCK_SESSION_OPEN_BLACKOUT_MIN,
} from "@/lib/stock-trade-constants";

export type StockVmRuntimeState =
  | "running"
  | "idle_ok"
  | "stale"
  | "unknown";

export type StockVmRuntimeStatus = {
  state: StockVmRuntimeState;
  /** 素人向け短ラベル */
  label: string;
  detail: string;
  syncAgeMinutes: number | null;
  heartbeatAgeMinutes: number | null;
  lastSyncedAt: string | null;
  lastHeartbeatAt: string | null;
  sessionOpenNow: boolean;
  allowLiveOrders: boolean | null;
  kabuPort: number | null;
  productionApi: boolean;
};

function jstParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return { weekday, hour, minute };
}

function isRoughJpEquitySession(now = new Date()): boolean {
  const { weekday, hour, minute } = jstParts(now);
  if (weekday === "Sat" || weekday === "Sun") return false;
  const mins = hour * 60 + minute;
  const open = 9 * 60;
  const amEnd = 11 * 60 + 30;
  const pmStart = 12 * 60 + 30;
  const close = 15 * 60;
  const openOk =
    mins >= open + STOCK_SESSION_OPEN_BLACKOUT_MIN && mins <= amEnd;
  const pmOk =
    mins >= pmStart &&
    mins <= close - STOCK_SESSION_CLOSE_BLACKOUT_MIN;
  return openOk || pmOk;
}

function ageMinutes(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return (now.getTime() - t) / 60_000;
}

/** 場中: 45分以内の sync/heartbeat → 稼働中。場外: 18時間以内なら待機OK。 */
export function buildStockVmRuntimeStatus(input: {
  snapshot: StockBrokerSnapshot | null;
  orders: StockBrokerOrderRecord[];
  now?: Date;
}): StockVmRuntimeStatus {
  const now = input.now ?? new Date();
  const sessionOpenNow = isRoughJpEquitySession(now);
  const lastSyncedAt = input.snapshot?.syncedAt ?? null;
  const lastHeartbeatAt =
    input.orders.length > 0
      ? [...input.orders].sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )[0]!.createdAt
      : null;

  const syncAgeMinutes = ageMinutes(lastSyncedAt, now);
  const heartbeatAgeMinutes = ageMinutes(lastHeartbeatAt, now);
  const freshestMinutes = (() => {
    const ages = [syncAgeMinutes, heartbeatAgeMinutes].filter(
      (n): n is number => typeof n === "number",
    );
    return ages.length ? Math.min(...ages) : null;
  })();

  const meta = input.snapshot?.bridgeMeta;
  const allowLiveOrders =
    typeof meta?.allowLiveOrders === "boolean" ? meta.allowLiveOrders : null;
  const kabuPort = meta?.kabuPort ?? null;
  const productionApi = kabuPort === 18080;

  if (!input.snapshot) {
    return {
      state: "unknown",
      label: "未同期",
      detail:
        "証券スナップショットがありません。Azure VM の kabu-bridge sync が一度も届いていないか、停止中です。",
      syncAgeMinutes: null,
      heartbeatAgeMinutes: null,
      lastSyncedAt: null,
      lastHeartbeatAt,
      sessionOpenNow,
      allowLiveOrders,
      kabuPort,
      productionApi,
    };
  }

  // 場中: 90分超は停止疑い。場外: 18時間超は停止疑い。
  const runningMaxMin = 45;
  const sessionStaleMin = 90;
  const offHoursOkMin = 18 * 60;

  if (freshestMinutes != null && freshestMinutes <= runningMaxMin) {
    return {
      state: "running",
      label: "稼働中",
      detail: `最終応答から約 ${Math.max(1, Math.round(freshestMinutes))} 分。sync / trade が回っている状態です。`,
      syncAgeMinutes,
      heartbeatAgeMinutes,
      lastSyncedAt,
      lastHeartbeatAt,
      sessionOpenNow,
      allowLiveOrders,
      kabuPort,
      productionApi,
    };
  }

  if (!sessionOpenNow && freshestMinutes != null && freshestMinutes <= offHoursOkMin) {
    return {
      state: "idle_ok",
      label: "待機（市場外）",
      detail: `ザラ場外のため更新間隔が開いていても正常です。最終応答から約 ${Math.round(freshestMinutes / 60)} 時間。`,
      syncAgeMinutes,
      heartbeatAgeMinutes,
      lastSyncedAt,
      lastHeartbeatAt,
      sessionOpenNow,
      allowLiveOrders,
      kabuPort,
      productionApi,
    };
  }

  if (
    sessionOpenNow &&
    freshestMinutes != null &&
    freshestMinutes <= sessionStaleMin
  ) {
    return {
      state: "idle_ok",
      label: "応答やや遅れ",
      detail: `場中ですが最終応答から約 ${Math.round(freshestMinutes)} 分。まもなく更新されるか、一時遅延の可能性があります。`,
      syncAgeMinutes,
      heartbeatAgeMinutes,
      lastSyncedAt,
      lastHeartbeatAt,
      sessionOpenNow,
      allowLiveOrders,
      kabuPort,
      productionApi,
    };
  }

  const ageLabel =
    freshestMinutes == null
      ? "不明"
      : freshestMinutes >= 60
        ? `約 ${Math.round(freshestMinutes / 60)} 時間`
        : `約 ${Math.round(freshestMinutes)} 分`;

  return {
    state: "stale",
    label: "停止疑い",
    detail: `最終応答が ${ageLabel}前です。Azure VM が止まっているか、sync/trade タスクが動いていない可能性があります。`,
    syncAgeMinutes,
    heartbeatAgeMinutes,
    lastSyncedAt,
    lastHeartbeatAt,
    sessionOpenNow,
    allowLiveOrders,
    kabuPort,
    productionApi,
  };
}
