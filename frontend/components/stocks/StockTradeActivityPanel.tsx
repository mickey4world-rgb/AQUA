"use client";

import type { StockBrokerActivity } from "@/lib/stock-broker-activity";

function formatYen(n: number): string {
  return `${Math.round(n).toLocaleString("ja-JP")}円`;
}

function signedYen(n: number): string {
  const abs = formatYen(Math.abs(n));
  if (n > 0) return `+${abs}`;
  if (n < 0) return `-${abs}`;
  return abs;
}

function DayCard({
  title,
  day,
  accent,
}: {
  title: string;
  day: StockBrokerActivity["today"];
  accent: "cyan" | "amber";
}) {
  const ring =
    accent === "cyan"
      ? "border-cyan-400/25 bg-cyan-500/5"
      : "border-amber-400/25 bg-amber-500/5";
  return (
    <div className={`rounded-xl border px-4 py-3 ${ring}`}>
      <p className="text-[11px] font-medium text-slate-300">
        {title} · {day.label}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <p className="text-[10px] text-slate-500">発注ログ</p>
          <p className="text-base font-semibold text-white">{day.tradeCount} 件</p>
          <p className="text-[10px] text-slate-500">
            LIVE {day.liveCount} · dry {day.dryRunCount}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-slate-500">買付</p>
          <p className="text-base font-semibold text-sky-300">
            {formatYen(day.buyYen)}
          </p>
          <p className="text-[10px] text-slate-500">{day.buyCount} 回</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-500">売却</p>
          <p className="text-base font-semibold text-rose-300">
            {formatYen(day.sellYen)}
          </p>
          <p className="text-[10px] text-slate-500">{day.sellCount} 回</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-500">実現損益</p>
          <p
            className={`text-base font-semibold ${
              day.realizedPnlYen >= 0 ? "text-emerald-300" : "text-rose-300"
            }`}
          >
            {signedYen(day.realizedPnlYen)}
          </p>
          {day.checkCount > 0 && (
            <p className="text-[10px] text-slate-500">点検 {day.checkCount}</p>
          )}
        </div>
      </div>
      {day.symbols.length > 0 && (
        <p className="mt-2 text-[11px] text-slate-400">
          銘柄: {day.symbols.join(" / ")}
        </p>
      )}
      {day.tradeCount === 0 && (
        <p className="mt-2 text-[11px] text-slate-500">
          この日の売買ログはまだありません
          {day.checkCount > 0 ? `（点検 ${day.checkCount} 回）` : "（見送り含む）"}
          。
        </p>
      )}
    </div>
  );
}

function HourlyChart({
  title,
  buckets,
  compactEmpty,
}: {
  title: string;
  buckets: StockBrokerActivity["todayHourly"];
  compactEmpty?: boolean;
}) {
  const visible = compactEmpty
    ? buckets.filter((b) => b.tradeCount > 0 || b.checkCount > 0)
    : buckets;
  const maxVol = Math.max(
    1,
    ...visible.map((b) => b.buyYen + b.sellYen + (b.checkCount > 0 ? 1 : 0)),
  );

  if (
    visible.length === 0 ||
    (compactEmpty &&
      visible.every((b) => b.tradeCount === 0 && b.checkCount === 0))
  ) {
    return (
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
          {title}
        </p>
        <p className="mt-2 text-sm text-slate-500">時間帯の記録はありません。</p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
        {title}
      </p>
      <p className="mt-1 text-[11px] text-slate-500">
        15分ごとの trade で売買があった時間帯（薄い棒は点検＝候補なし）
      </p>
      <div
        className="mt-3 flex items-end gap-1 overflow-x-auto pb-1"
        style={{ minHeight: 88 }}
      >
        {visible.map((b) => {
          const vol = b.buyYen + b.sellYen;
          const h =
            b.tradeCount === 0 && b.checkCount === 0
              ? 4
              : b.tradeCount === 0
                ? 10
                : Math.max(8, Math.round((Math.max(vol, 1) / maxVol) * 72));
          return (
            <div
              key={b.hour}
              className="flex w-7 flex-col items-center gap-1 sm:w-8"
            >
              <div
                className={`w-full rounded-t ${
                  b.tradeCount === 0
                    ? b.checkCount > 0
                      ? "bg-slate-500/40"
                      : "bg-white/5"
                    : b.buyYen >= b.sellYen
                      ? "bg-sky-400/80"
                      : "bg-rose-400/80"
                }`}
                style={{ height: h }}
                title={`${b.label}: 買 ${b.buyYen} / 売 ${b.sellYen} / 売買${b.tradeCount} / 点検${b.checkCount}`}
              />
              <span className="text-[9px] text-slate-500">
                {String(b.hour).padStart(2, "0")}
              </span>
            </div>
          );
        })}
      </div>

      <ul className="mt-3 max-h-48 space-y-1.5 overflow-y-auto text-[12px]">
        {visible
          .filter((b) => b.tradeCount > 0 || b.checkCount > 0)
          .map((b) => (
            <li
              key={`detail-${b.hour}`}
              className="rounded-lg border border-white/5 bg-black/15 px-3 py-2 text-slate-300"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium text-white">{b.label}</span>
                <span className="text-slate-400">
                  売買 {b.tradeCount} · 点検 {b.checkCount}
                  {b.buyYen + b.sellYen > 0 && (
                    <>
                      {" "}
                      · 買 {formatYen(b.buyYen)} · 売 {formatYen(b.sellYen)}
                    </>
                  )}
                </span>
              </div>
              <ul className="mt-1 space-y-0.5 text-[11px] text-slate-400">
                {b.actions.map((a, i) => (
                  <li key={`${b.hour}-${i}`}>
                    {a.time}{" "}
                    {a.side === "check"
                      ? "点検"
                      : a.side === "buy"
                        ? "買"
                        : "売"}{" "}
                    {a.symbol}
                    {a.qty > 0 ? ` ×${a.qty}` : ""}
                    {a.notionalYen > 0 ? ` ${formatYen(a.notionalYen)}` : ""}
                    {a.status !== "submitted" && a.status !== "dry_run"
                      ? ` [${a.status}]`
                      : a.status === "dry_run"
                        ? " [dry-run]"
                        : ""}
                    {a.reason ? ` — ${a.reason.slice(0, 80)}` : ""}
                  </li>
                ))}
              </ul>
            </li>
          ))}
      </ul>
    </div>
  );
}

type Props = {
  activity: StockBrokerActivity;
};

export default function StockTradeActivityPanel({ activity }: Props) {
  const d = activity.diagnosis;
  return (
    <div className="mt-4 space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          約定サマリー · 時間帯
        </p>
        <p className="mt-1 text-[11px] text-slate-500">
          JST。仮想通貨の Asset Trade と同じく、今日／前日の件数と時間帯を表示します。
          今月 売買 {activity.monthTradeCount} 件 · 買{" "}
          {formatYen(activity.monthBuyYen)} · 売{" "}
          {formatYen(activity.monthSellYen)}
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <DayCard title="今日" day={activity.today} accent="cyan" />
        <DayCard title="前日" day={activity.yesterday} accent="amber" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <HourlyChart title="今日の時間帯" buckets={activity.todayHourly} />
        <HourlyChart
          title="前日の時間帯（記録ありのみ）"
          buckets={activity.yesterdayHourly}
          compactEmpty
        />
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          いま動いていない理由
        </p>
        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-400">
          <span className="rounded-full border border-white/10 px-2 py-0.5">
            {d.sessionOpenNow ? "おおよそ場中" : "場外寄り"}
          </span>
          <span className="rounded-full border border-white/10 px-2 py-0.5">
            アクティブ監視 {d.activeWatchCount}
          </span>
          <span className="rounded-full border border-white/10 px-2 py-0.5">
            保有 {d.holdingsCount}
          </span>
          <span className="rounded-full border border-white/10 px-2 py-0.5">
            現金 {formatYen(d.cashYen)}
          </span>
          <span className="rounded-full border border-white/10 px-2 py-0.5">
            ログ累計 {d.totalOrderCount}
          </span>
        </div>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[12px] text-slate-300">
          {d.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
