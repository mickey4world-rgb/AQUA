/**
 * 外出先確認用: 株ステーション／VM の素人向けチェックリスト。
 * 「API 緑マーク」= bridge がトークン取得できた状態（GUI アイコン緑と同等のオラクル）。
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
  /** GUI の API 緑アイコン相当（トークン取得成功） */
  greenMark: boolean | null;
  greenMarkLabel: string;
  /** OTP／パスコード入力の画面操作が必要か */
  needsInteractiveLogin: boolean;
  loginHint: string;
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

  const greenMark = healthFresh
    ? stationTokenOk
    : stationTokenOk === true
      ? true
      : null;

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
      ok: healthFresh
        ? stationReachable
        : stationReachable === true
          ? true
          : null,
      detail: !healthFresh
        ? healthAge == null
          ? "ヘルス未受信（bridge の health/sync 待ち）"
          : `最終ヘルスから約 ${Math.round(healthAge)} 分（古め）`
        : stationReachable
          ? "localhost API に到達"
          : "HTTP 到達失敗（未起動・ポート違い）",
    },
    {
      id: "green-mark",
      label: "API 緑マーク",
      ok: greenMark,
      detail:
        greenMark === true
          ? "トークン取得成功＝GUI の API 緑と同等（正常）"
          : greenMark === false
            ? meta?.lastError ||
              "未ログイン／OTP未完了／APIパスワード不一致。携帯から画面操作でログインが必要です"
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

  const vmOk = vm.state === "running" || vm.state === "idle_ok";
  const criticalOk = greenMark === true && vmOk;
  const needsInteractiveLogin =
    greenMark === false ||
    (stationReachable === true && stationTokenOk === false) ||
    (vmOk && greenMark !== true && healthFresh);

  return {
    vm,
    items,
    overallOk: criticalOk,
    greenMark,
    greenMarkLabel:
      greenMark === true
        ? "緑（正常）"
        : greenMark === false
          ? "緑ではない（要ログイン）"
          : "不明",
    needsInteractiveLogin: Boolean(needsInteractiveLogin && !criticalOk),
    loginHint: criticalOk
      ? "緑マーク確認済み。追加の画面操作は不要です。"
      : "株ステーションはパスコード／ワンタイムパスワード入力が必要です。インターネット公開の RDP は使いません。Tailscale（私設VPN）経由で VM 画面を開き、OTP を入れて緑になったらこの画面で再確認してください。",
    summary: criticalOk
      ? "外出確認OK: API 緑マーク相当・VM 応答あり"
      : needsInteractiveLogin
        ? "要ログイン操作: 携帯から VM 画面で OTP／パスコード入力 → 緑マークをこの画面で確認"
        : "要確認: VM 応答またはヘルス報告を見直してください",
  };
}
