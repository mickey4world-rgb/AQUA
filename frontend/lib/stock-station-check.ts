/**
 * 外出先確認用: 株ステーション／VM の素人向けチェックリスト。
 */
import type { StockBrokerSnapshot } from "@/lib/types/stock-broker";
import type { StockBrokerOrderRecord } from "@/lib/types/stock-broker-trade";
import {
  buildStockVmRuntimeStatus,
  type StockVmRuntimeStatus,
} from "@/lib/stock-vm-status";

export type StationCheckItem = {
  id: string;
  label: string;
  ok: boolean | null;
  detail: string;
};

export type StockStationCheckView = {
  vm: StockVmRuntimeStatus;
  items: StationCheckItem[];
  overallOk: boolean;
  summary: string;
};

function ageMinutes(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return (now.getTime() - t) / 60_000;
}

export function buildStockStationCheck(input: {
  snapshot: StockBrokerSnapshot | null;
  orders: StockBrokerOrderRecord[];
  now?: Date;
}): StockStationCheckView {
  const now = input.now ?? new Date();
  const vm = buildStockVmRuntimeStatus({
    snapshot: input.snapshot,
    orders: input.orders,
    now,
  });
  const meta = input.snapshot?.bridgeMeta;
  const healthAge = ageMinutes(meta?.healthReportedAt ?? null, now);
  const syncAge = ageMinutes(input.snapshot?.syncedAt ?? null, now);
  const healthFresh = healthAge != null && healthAge <= 45;
  const syncFresh = syncAge != null && syncAge <= 45;

  const stationReachable =
    typeof meta?.stationReachable === "boolean" ? meta.stationReachable : null;
  const stationTokenOk =
    typeof meta?.stationTokenOk === "boolean" ? meta.stationTokenOk : null;

  const items: StationCheckItem[] = [
    {
      id: "vm",
      label: "Azure VM 応答",
      ok:
        vm.state === "running" || vm.state === "idle_ok"
          ? true
          : vm.state === "stale"
            ? false
            : null,
      detail: `${vm.label} — ${vm.detail}`,
    },
    {
      id: "station-http",
      label: "株ステーション起動",
      ok: healthFresh ? stationReachable : stationReachable === true ? true : null,
      detail: !healthFresh
        ? healthAge == null
          ? "ヘルス未受信（bridge の health/sync 待ち）"
          : `最終ヘルスから約 ${Math.round(healthAge)} 分（古め）`
        : stationReachable
          ? "localhost API に到達"
          : "HTTP 到達失敗（未起動・ポート違い）",
    },
    {
      id: "station-login",
      label: "株ステーション API ログイン",
      ok: healthFresh ? stationTokenOk : stationTokenOk === true ? true : null,
      detail:
        stationTokenOk === true
          ? "トークン取得成功（API パスワード一致）"
          : stationTokenOk === false
            ? meta?.lastError ||
              "トークン失敗（未ログイン／APIパスワード不一致）"
            : "まだ判定データがありません",
    },
    {
      id: "sync",
      label: "余力・保有の同期",
      ok: syncFresh ? true : input.snapshot ? false : null,
      detail: input.snapshot?.syncedAt
        ? syncFresh
          ? `同期OK（約 ${Math.max(1, Math.round(syncAge ?? 0))} 分前）`
          : `最終同期から約 ${Math.round((syncAge ?? 0) / 60)} 時間`
        : "未同期",
    },
    {
      id: "live",
      label: "発注モード",
      ok: meta ? true : null,
      detail: meta
        ? meta.allowLiveOrders
          ? `LIVE · API :${meta.kabuPort ?? "?"}`
          : `dry-run · API :${meta.kabuPort ?? "?"}`
        : "未報告",
    },
  ];

  const criticalOk =
    items.find((i) => i.id === "station-login")?.ok === true &&
    (vm.state === "running" || vm.state === "idle_ok");

  return {
    vm,
    items,
    overallOk: criticalOk,
    summary: criticalOk
      ? "外出確認OK: VM 応答あり・株ステーション API ログイン済み"
      : "要確認: ステーションログインまたは VM 応答を見直してください",
  };
}
