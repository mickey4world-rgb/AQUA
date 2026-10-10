/**
 * 外出先確認用: 株ステーション／VM の素人向けチェックリスト。
 * 「API 緑マーク」= bridge がトークン取得できた状態（GUI アイコン緑と同等のオラクル）。
 * 「自動売買準備OK」= 緑 + 同期新鮮 + LIVE + 場中なら点検ハートビート新鮮。
 */
import type { StockBrokerSnapshot } from "@/lib/types/stock-broker";
import type { StockBrokerOrderRecord } from "@/lib/types/stock-broker-trade";
import {
  buildStockVmRuntimeStatus,
  type StockVmRuntimeStatus,
} from "@/lib/stock-vm-status";
import { isJpEquityMarketHours } from "@/lib/stock-jp-session";

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
  /** 自動売買が人手なしで回る準備が整っているか（運用オラクル） */
  autoTradeReady: boolean;
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
  const marketHours = isJpEquityMarketHours(now);
  const heartbeatAge = vm.heartbeatAgeMinutes;
  const heartbeatFresh =
    heartbeatAge != null && heartbeatAge <= (marketHours ? 20 : 18 * 60);

  const stationReachable =
    typeof meta?.stationReachable === "boolean" ? meta.stationReachable : null;
  const stationTokenOk =
    typeof meta?.stationTokenOk === "boolean" ? meta.stationTokenOk : null;
  const allowLive =
    typeof meta?.allowLiveOrders === "boolean" ? meta.allowLiveOrders : null;

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
      id: "heartbeat",
      label: "自動売買ティック",
      ok: marketHours
        ? heartbeatFresh
          ? true
          : heartbeatAge == null
            ? false
            : false
        : heartbeatAge == null
          ? null
          : true,
      detail: marketHours
        ? heartbeatAge == null
          ? "場中なのに点検/発注ログなし。market-tick 停止疑い"
          : heartbeatFresh
            ? `場中ハートビートOK（約 ${Math.max(1, Math.round(heartbeatAge))} 分前）`
            : `場中なのに最終ティックから約 ${Math.round(heartbeatAge)} 分。自動売買停止疑い`
        : heartbeatAge == null
          ? "場外（ティック間隔は開いてよい）"
          : `場外待機（最終ティック約 ${Math.max(1, Math.round(heartbeatAge))} 分前）`,
    },
    {
      id: "live",
      label: "発注モード",
      ok: allowLive === true ? true : allowLive === false ? false : null,
      detail:
        allowLive === true
          ? `LIVE · API :${meta?.kabuPort ?? "?"}`
          : allowLive === false
            ? `dry-run · API :${meta?.kabuPort ?? "?"}（実発注されない）`
            : "未報告",
    },
  ];

  const vmOk = vm.state === "running" || vm.state === "idle_ok";
  const criticalOk = greenMark === true && vmOk;
  const autoTradeReady =
    criticalOk &&
    syncFresh &&
    allowLive === true &&
    (!marketHours || heartbeatFresh);
  const needsInteractiveLogin =
    greenMark === false ||
    (stationReachable === true && stationTokenOk === false) ||
    (vmOk && greenMark !== true && healthFresh);

  let summary: string;
  if (autoTradeReady) {
    summary = marketHours
      ? "自動売買準備OK: 緑・同期・LIVE・場中ティック正常"
      : "自動売買準備OK（場外待機）: 緑・同期・LIVE。次のザラ場でティック継続";
  } else if (criticalOk) {
    summary =
      allowLive === false
        ? "ログインはOKだが dry-run（実発注オフ）"
        : !syncFresh
          ? "ログインはOKだが同期が古い — sync/market-tick を確認"
          : marketHours && !heartbeatFresh
            ? "ログインはOKだが場中ティック停止疑い"
            : "外出確認OK: API 緑マーク相当・VM 応答あり";
  } else if (needsInteractiveLogin) {
    summary =
      "要ログイン操作: 携帯から VM 画面で OTP／パスコード入力 → 緑マークをこの画面で確認";
  } else {
    summary = "要確認: VM 応答またはヘルス報告を見直してください";
  }

  return {
    vm,
    items,
    overallOk: criticalOk,
    autoTradeReady,
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
    summary,
  };
}
