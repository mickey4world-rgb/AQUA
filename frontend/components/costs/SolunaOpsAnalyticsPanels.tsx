"use client";

import { costsPanelClass, formatCurrency, formatPercent } from "@/lib/analytics-utils";
import type {
  SolunaOpsAnalyticsReport,
  SolunaOpsDaySummary,
  SolunaOpsHourBucket,
} from "@/lib/types/analytics";

type Props = {
  report: SolunaOpsAnalyticsReport;
};

function levelJa(level: string): string {
  if (level === "city") return "都市";
  if (level === "town") return "町";
  return "村";
}

function formatJst(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function reasonJa(reason: string): string {
  if (reason === "dca" || reason.includes("dca")) return "DCA / 召喚";
  if (reason === "take-profit" || reason.includes("利確")) return "利確";
  if (reason === "stop-loss" || reason.includes("損切")) return "損切り";
  return reason || "—";
}

function signedYen(n: number): string {
  return `${n >= 0 ? "+" : ""}${formatCurrency(n)}`;
}

function formatUnitPrice(product: string | undefined, price: number): string {
  const code = (product ?? "BTC_JPY").replace("_JPY", "");
  if (code === "XRP") {
    return `${price.toLocaleString("ja-JP", { maximumFractionDigits: 2 })}円`;
  }
  return formatCurrency(price);
}

function formatHeld(product: string, held: number): string {
  if (product === "XRP_JPY" || product === "XRP") {
    return `${Math.floor(held || 0).toLocaleString("ja-JP")} XRP`;
  }
  if (product === "ETH_JPY" || product === "ETH") {
    return `${(held || 0).toFixed(4)} ETH`;
  }
  return `${(held || 0).toFixed(4)} BTC`;
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3">
      <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

function DayCard({
  title,
  day,
  accent,
}: {
  title: string;
  day: SolunaOpsDaySummary;
  accent: "amber" | "cyan";
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
          <p className="text-[10px] text-slate-500">約定</p>
          <p className="text-base font-semibold text-white">{day.tradeCount} 件</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-500">買付</p>
          <p className="text-base font-semibold text-sky-300">{formatCurrency(day.buyYen)}</p>
          <p className="text-[10px] text-slate-500">{day.buyCount} 回</p>
        </div>
        <div>
          <p className="text-[10px] text-slate-500">売却</p>
          <p className="text-base font-semibold text-rose-300">{formatCurrency(day.sellYen)}</p>
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
        </div>
      </div>
      {day.products.length > 0 && (
        <p className="mt-2 text-[11px] text-slate-400">銘柄: {day.products.join(" / ")}</p>
      )}
      {day.tradeCount === 0 && (
        <p className="mt-2 text-[11px] text-slate-500">この日の約定はまだありません（見送り含む）。</p>
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
  buckets: SolunaOpsHourBucket[];
  compactEmpty?: boolean;
}) {
  const visible = compactEmpty ? buckets.filter((b) => b.tradeCount > 0) : buckets;
  const maxVol = Math.max(1, ...visible.map((b) => b.buyYen + b.sellYen));

  if (visible.length === 0 || (compactEmpty && visible.every((b) => b.tradeCount === 0))) {
    return (
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">{title}</p>
        <p className="mt-2 text-sm text-slate-500">時間帯の約定はありません。</p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">{title}</p>
      <p className="mt-1 text-[11px] text-slate-500">
        毎時の Asset Trade で約定があった時間帯を表示（HOLD のみの時間は記録なし）
      </p>
      <div className="mt-3 flex items-end gap-1 overflow-x-auto pb-1" style={{ minHeight: 88 }}>
        {visible.map((b) => {
          const vol = b.buyYen + b.sellYen;
          const h = b.tradeCount === 0 ? 4 : Math.max(8, Math.round((vol / maxVol) * 72));
          return (
            <div key={b.hour} className="flex w-7 flex-col items-center gap-1 sm:w-8">
              <div
                className={`w-full rounded-t ${
                  b.tradeCount === 0
                    ? "bg-white/5"
                    : b.buyYen >= b.sellYen
                      ? "bg-sky-400/80"
                      : "bg-rose-400/80"
                }`}
                style={{ height: h }}
                title={`${b.label}: 買 ${b.buyYen} / 売 ${b.sellYen} / ${b.tradeCount}件`}
              />
              <span className="text-[9px] text-slate-500">{String(b.hour).padStart(2, "0")}</span>
            </div>
          );
        })}
      </div>

      <ul className="mt-3 max-h-48 space-y-1.5 overflow-y-auto text-[12px]">
        {visible
          .filter((b) => b.tradeCount > 0)
          .map((b) => (
            <li
              key={`detail-${b.hour}`}
              className="rounded-lg border border-white/5 bg-black/15 px-3 py-2 text-slate-300"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium text-white">{b.label}</span>
                <span className="text-slate-400">
                  {b.tradeCount}件 · 買 {formatCurrency(b.buyYen)} · 売 {formatCurrency(b.sellYen)}
                  {b.realizedPnlYen !== 0 && (
                    <> · 損益 {signedYen(b.realizedPnlYen)}</>
                  )}
                </span>
              </div>
              <ul className="mt-1 space-y-0.5 text-[11px] text-slate-400">
                {b.actions.map((a, i) => (
                  <li key={`${b.hour}-${i}`}>
                    {a.time} {a.side === "BUY" ? "買" : "売"} {a.product}{" "}
                    {formatCurrency(a.sizeJpy)}（{reasonJa(a.reason)}）
                  </li>
                ))}
              </ul>
            </li>
          ))}
      </ul>
    </div>
  );
}

export default function SolunaOpsAnalyticsPanels({ report }: Props) {
  const assets = report.assets;
  const note = report.note;
  const boinc = report.boinc;
  const settlement = report.settlement;

  return (
    <div className="space-y-6">
      <div className={`${costsPanelClass} p-5`}>
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-cyan-300/80">
          Soluna Ops
        </p>
        <h2 className="mt-2 text-xl font-bold text-white">
          {report.monthLabel} · Note・資産運用・社会貢献
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          有料 Note の投稿状況、魔力タンクの運用、BOINC 解析パワー（拠点都市）の実績です。
          {report.updatedAt && (
            <span className="ml-2 text-slate-500">
              最終更新 {formatJst(report.updatedAt)}
            </span>
          )}
        </p>
        <p className="mt-3 text-[12px] text-slate-400">
          資産運用API:{" "}
          <span className={report.bitFlyerConfigured ? "text-emerald-300" : "text-amber-300"}>
            {report.bitFlyerConfigured ? "接続設定あり" : "未設定"}
          </span>
          {" · "}
          Note:{" "}
          <span className={note?.configured ? "text-emerald-300" : "text-amber-300"}>
            {note?.configured ? "Cookie 設定あり" : "未設定"}
          </span>
        </p>
      </div>

      {/* ── Note ── */}
      {note && (
        <section className={`${costsPanelClass} p-5`}>
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-fuchsia-300/80">Note</p>
            <h3 className="mt-1 text-lg font-semibold text-white">Note 投稿・アクセス</h3>
            <p className="mt-1 text-sm text-slate-400">
              朝ブリーフィングの自動投稿実績と、note ダッシュボード相当の PV / スキです。
            </p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="今月の公開"
              value={`${note.monthPublishCount} 本`}
              hint={
                note.monthPaidPublishCount > 0
                  ? `有料 ${note.monthPaidPublishCount} · 失敗/未公開 ${note.monthDraftOrFailedCount}`
                  : `失敗/未公開 ${note.monthDraftOrFailedCount}`
              }
            />
            <Stat
              label="直近公開"
              value={note.latestPublishedAt ? formatJst(note.latestPublishedAt) : "—"}
              hint={note.latestTitle ?? undefined}
            />
            <Stat
              label="今月の PV"
              value={note.monthViewCount != null ? note.monthViewCount.toLocaleString("ja-JP") : "—"}
              hint={
                note.lifetimeViewCount != null
                  ? `累計 ${note.lifetimeViewCount.toLocaleString("ja-JP")}`
                  : note.pvError ?? undefined
              }
            />
            <Stat
              label="有料利用"
              value={note.paidSalesCount != null ? `${note.paidSalesCount} 件` : "未取得"}
              hint={note.paidSalesNote}
            />
          </div>

          {note.latestNoteUrl && (
            <a
              href={note.latestNoteUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block text-[12px] text-fuchsia-200 underline"
            >
              直近の記事を開く
            </a>
          )}
          {note.creatorUrl && (
            <a
              href={note.creatorUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 ml-3 inline-block text-[12px] text-slate-400 underline"
            >
              クリエイターページ
            </a>
          )}

          {note.articles.length > 0 && (
            <div className="mt-5">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                今月の投稿ログ（アプリ台帳）
              </p>
              <div className="mt-2 overflow-x-auto">
                <table className="min-w-full text-left text-[12px]">
                  <thead className="text-slate-500">
                    <tr>
                      <th className="py-1.5 pr-3 font-medium">日時</th>
                      <th className="py-1.5 pr-3 font-medium">タイトル</th>
                      <th className="py-1.5 pr-3 font-medium">状態</th>
                      <th className="py-1.5 pr-3 font-medium">価格</th>
                      <th className="py-1.5 pr-3 font-medium">PV</th>
                      <th className="py-1.5 font-medium">スキ</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-300">
                    {note.articles.map((a) => (
                      <tr key={a.id} className="border-t border-white/5">
                        <td className="py-1.5 pr-3 whitespace-nowrap">
                          {a.createdAt ? formatJst(a.createdAt) : "—"}
                        </td>
                        <td className="py-1.5 pr-3 max-w-[220px] truncate">
                          {a.noteUrl ? (
                            <a href={a.noteUrl} target="_blank" rel="noreferrer" className="text-fuchsia-200 underline">
                              {a.title}
                            </a>
                          ) : (
                            a.title
                          )}
                        </td>
                        <td className="py-1.5 pr-3">
                          {a.published ? "公開" : a.error ? "失敗" : "未公開"}
                        </td>
                        <td className="py-1.5 pr-3">
                          {a.priceYen != null && a.priceYen > 0 ? `${a.priceYen}円` : "無料"}
                        </td>
                        <td className="py-1.5 pr-3">
                          {a.viewCount != null ? a.viewCount.toLocaleString("ja-JP") : "—"}
                        </td>
                        <td className="py-1.5">
                          {a.likeCount != null ? a.likeCount.toLocaleString("ja-JP") : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {note.topByViews.length > 0 && (
            <div className="mt-5">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                note 側 PV 上位（月間）
              </p>
              <ul className="mt-2 space-y-1.5 text-[12px] text-slate-300">
                {note.topByViews.slice(0, 8).map((a) => (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-white/5 bg-black/15 px-3 py-2"
                  >
                    <span className="truncate">
                      {a.noteUrl ? (
                        <a href={a.noteUrl} target="_blank" rel="noreferrer" className="text-fuchsia-200 underline">
                          {a.title}
                        </a>
                      ) : (
                        a.title
                      )}
                    </span>
                    <span className="text-slate-400 whitespace-nowrap">
                      PV {a.viewCount?.toLocaleString("ja-JP") ?? "—"}
                      {a.likeCount != null && ` · スキ ${a.likeCount}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* ── 資産運用 ── */}
      <section className={`${costsPanelClass} p-5`}>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-amber-300/80">Assets</p>
            <h3 className="mt-1 text-lg font-semibold text-white">資産運用分析</h3>
          </div>
          {assets && (
            <div className="flex flex-wrap gap-2 text-[11px]">
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-slate-200">
                {assets.battleMode === "attack" ? "攻撃バフ" : "防御モード"}
              </span>
              {assets.sleepMode && (
                <span className="rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2.5 py-1 text-emerald-200">
                  おやすみモード
                </span>
              )}
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-slate-300">
                status: {assets.status}
              </span>
            </div>
          )}
        </div>

        {!assets ? (
          <p className="mt-4 text-sm text-slate-400">
            まだ資産台帳がありません。API キー設定後、Asset Trade を実行すると表示されます。
          </p>
        ) : (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat
                label="総魔力"
                value={formatCurrency(assets.totalYen)}
                hint={`前日比 ${assets.dayChangeYen >= 0 ? "+" : ""}${formatCurrency(assets.dayChangeYen)}`}
              />
              <Stat
                label="現金（守護巨兵）"
                value={formatCurrency(assets.cashYen)}
                hint={`Lv.${assets.golemLevel.toFixed(1)} · ${formatPercent(assets.cashAllocationPct)}`}
              />
              <Stat
                label="月次目標(2%)進捗"
                value={formatPercent(assets.targetProgressPct)}
                hint={`${formatCurrency(assets.monthlyRealizedPnlYen)} / 目標 ${formatCurrency(assets.monthlyTargetYen)}`}
              />
              <Stat
                label="分散ルール"
                value="下限28%"
                hint="単一42% / 暗号合計72%（BTC・ETH・XRP）"
              />
            </div>

            <div className="mt-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                ポートフォリオ配分
              </p>
              <div className="mt-2 flex h-3 overflow-hidden rounded-full bg-white/10">
                <div
                  className="bg-amber-400/80"
                  style={{ width: `${Math.max(0, assets.cashAllocationPct)}%` }}
                  title={`現金 ${assets.cashAllocationPct}%`}
                />
                <div
                  className="bg-sky-400/80"
                  style={{ width: `${Math.max(0, assets.btcAllocationPct)}%` }}
                  title={`BTC ${assets.btcAllocationPct}%`}
                />
                <div
                  className="bg-violet-400/80"
                  style={{ width: `${Math.max(0, assets.ethAllocationPct)}%` }}
                  title={`ETH ${assets.ethAllocationPct}%`}
                />
                <div
                  className="bg-cyan-300/80"
                  style={{ width: `${Math.max(0, assets.xrpAllocationPct)}%` }}
                  title={`XRP ${assets.xrpAllocationPct}%`}
                />
              </div>
              <p className="mt-2 text-[11px] text-slate-400">
                <span className="text-amber-200">現金 {formatPercent(assets.cashAllocationPct)}</span>
                {" · "}
                <span className="text-sky-200">BTC {formatPercent(assets.btcAllocationPct)}</span>
                {" · "}
                <span className="text-violet-200">ETH {formatPercent(assets.ethAllocationPct)}</span>
                {" · "}
                <span className="text-cyan-200">XRP {formatPercent(assets.xrpAllocationPct)}</span>
              </p>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Stat
                label="BTC（蒼竜）"
                value={formatHeld("BTC", assets.btcHeld)}
                hint={`${formatCurrency(assets.btcValueYen)} · Lv.${assets.dragonLevel.toFixed(1)} · ${formatCurrency(assets.btcPriceYen)}`}
              />
              <Stat
                label="ETH（不死鳥）"
                value={formatHeld("ETH", assets.ethHeld)}
                hint={`${formatCurrency(assets.ethValueYen)} · Lv.${assets.phoenixLevel.toFixed(1)} · ${formatCurrency(assets.ethPriceYen)}`}
              />
              <Stat
                label="XRP（海竜）"
                value={formatHeld("XRP", assets.xrpHeld)}
                hint={`${formatCurrency(assets.xrpValueYen)} · Lv.${assets.seaDragonLevel.toFixed(1)} · ${formatUnitPrice("XRP_JPY", assets.xrpPriceYen)}`}
              />
            </div>

            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full rounded-full ${assets.sleepMode ? "bg-emerald-400" : "bg-amber-400"}`}
                style={{ width: `${Math.min(100, assets.targetProgressPct)}%` }}
              />
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Stat label="今月の買付" value={formatCurrency(assets.monthBuyYen)} />
              <Stat label="今月の売却" value={formatCurrency(assets.monthSellYen)} />
              <Stat
                label="今月の実現損益"
                value={`${assets.monthRealizedPnlYen >= 0 ? "+" : ""}${formatCurrency(assets.monthRealizedPnlYen)}`}
                hint={`${assets.monthTradeCount} 件の取引`}
              />
            </div>

            {assets.byProduct?.length > 0 && (
              <div className="mt-5">
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                  銘柄別（保有・今月の売買）
                </p>
                <div className="mt-2 overflow-x-auto">
                  <table className="min-w-full text-left text-[12px]">
                    <thead className="text-slate-500">
                      <tr className="border-b border-white/10">
                        <th className="px-2 py-2 font-medium">銘柄</th>
                        <th className="px-2 py-2 font-medium">保有</th>
                        <th className="px-2 py-2 font-medium">評価額</th>
                        <th className="px-2 py-2 font-medium">配分</th>
                        <th className="px-2 py-2 font-medium">買付</th>
                        <th className="px-2 py-2 font-medium">売却</th>
                        <th className="px-2 py-2 font-medium">実現損益</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assets.byProduct.map((p) => (
                        <tr key={p.product} className="border-b border-white/5 text-slate-200">
                          <td className="px-2 py-2 font-medium text-white">{p.label}</td>
                          <td className="px-2 py-2">{formatHeld(p.product, p.held)}</td>
                          <td className="px-2 py-2">{formatCurrency(p.valueYen)}</td>
                          <td className="px-2 py-2">{formatPercent(p.allocationPct)}</td>
                          <td className="px-2 py-2 text-sky-300">
                            {formatCurrency(p.buyYen)}
                            <span className="ml-1 text-[10px] text-slate-500">{p.buyCount}回</span>
                          </td>
                          <td className="px-2 py-2 text-rose-300">
                            {formatCurrency(p.sellYen)}
                            <span className="ml-1 text-[10px] text-slate-500">{p.sellCount}回</span>
                          </td>
                          <td
                            className={`px-2 py-2 ${
                              p.realizedPnlYen >= 0 ? "text-emerald-300" : "text-rose-300"
                            }`}
                          >
                            {signedYen(p.realizedPnlYen)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="mt-6 space-y-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                前日 / 今日（JST）
              </p>
              <div className="grid gap-3 lg:grid-cols-2">
                <DayCard title="前日" day={assets.yesterday} accent="amber" />
                <DayCard title="今日" day={assets.today} accent="cyan" />
              </div>
              <div className="rounded-xl border border-white/8 bg-black/15 px-3 py-3 text-[12px] text-slate-300">
                評価額の前日比（台帳）:{" "}
                <span
                  className={
                    assets.dayChangeYen >= 0 ? "text-emerald-300" : "text-rose-300"
                  }
                >
                  {signedYen(assets.dayChangeYen)}
                </span>
                {" · "}前回総魔力 {formatCurrency(assets.previousTotalYen)} → 現在{" "}
                {formatCurrency(assets.totalYen)}
              </div>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <HourlyChart title="今日の時間帯" buckets={assets.todayHourly} />
              <HourlyChart
                title="前日の時間帯（約定ありのみ）"
                buckets={assets.yesterdayHourly}
                compactEmpty
              />
            </div>

            {(assets.btcPriceYen > 0 || assets.ethPriceYen > 0 || assets.xrpPriceYen > 0) && (
              <div className="mt-4 rounded-xl border border-white/8 bg-black/15 px-3 py-3 text-[12px] text-slate-300">
                BTC {formatCurrency(assets.btcPriceYen)} · ETH {formatCurrency(assets.ethPriceYen)} ·
                XRP {formatUnitPrice("XRP_JPY", assets.xrpPriceYen)}
                {" · "}元本 {formatCurrency(assets.principalYen)}
              </div>
            )}

            {(assets.solComment || assets.lunaComment) && (
              <div className="mt-4 space-y-1 text-[13px]">
                {assets.solComment && (
                  <p className="text-amber-50/90">⚔️ {assets.solComment}</p>
                )}
                {assets.lunaComment && (
                  <p className="text-indigo-100/90">📖 {assets.lunaComment}</p>
                )}
              </div>
            )}

            <div className="mt-5">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                今月の取引明細
              </p>
              {assets.trades.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">今月の約定はまだありません（見送り含む）。</p>
              ) : (
                <div className="mt-2 overflow-x-auto">
                  <table className="min-w-full text-left text-[12px]">
                    <thead className="text-slate-500">
                      <tr className="border-b border-white/10">
                        <th className="px-2 py-2 font-medium">日時</th>
                        <th className="px-2 py-2 font-medium">銘柄</th>
                        <th className="px-2 py-2 font-medium">売買</th>
                        <th className="px-2 py-2 font-medium">金額</th>
                        <th className="px-2 py-2 font-medium">単価</th>
                        <th className="px-2 py-2 font-medium">理由</th>
                        <th className="px-2 py-2 font-medium">実現損益</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assets.trades.map((t) => (
                        <tr key={t.id} className="border-b border-white/5 text-slate-200">
                          <td className="px-2 py-2 whitespace-nowrap">{formatJst(t.createdAt)}</td>
                          <td className="px-2 py-2">{t.product?.replace("_JPY", "") ?? "BTC"}</td>
                          <td
                            className={`px-2 py-2 font-semibold ${
                              t.side === "BUY" ? "text-sky-300" : "text-rose-300"
                            }`}
                          >
                            {t.side === "BUY" ? "買" : "売"}
                          </td>
                          <td className="px-2 py-2">{formatCurrency(t.sizeJpy)}</td>
                          <td className="px-2 py-2">{formatUnitPrice(t.product, t.priceBtc)}</td>
                          <td className="px-2 py-2">{reasonJa(t.reason)}</td>
                          <td className="px-2 py-2">
                            {t.realizedPnlJpy === undefined
                              ? "—"
                              : `${t.realizedPnlJpy >= 0 ? "+" : ""}${formatCurrency(t.realizedPnlJpy)}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {assets.monthlySummaries.length > 0 && (
              <div className="mt-5">
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                  月次サマリー
                </p>
                <ul className="mt-2 space-y-1.5 text-[12px] text-slate-300">
                  {[...assets.monthlySummaries].reverse().map((m) => (
                    <li
                      key={m.month}
                      className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-white/5 bg-black/10 px-3 py-2"
                    >
                      <span>{m.month}</span>
                      <span>
                        実現 {formatCurrency(m.realizedPnlYen)} / 目標{" "}
                        {formatCurrency(m.targetProfitYen)}
                        {m.goalReached ? " · 達成" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>

      {/* ── BOINC ── */}
      <section className={`${costsPanelClass} p-5`}>
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-emerald-300/80">BOINC</p>
          <h3 className="mt-1 text-lg font-semibold text-white">社会貢献・解析パワー</h3>
          <p className="mt-1 text-sm text-slate-400">
            討伐後の宇宙分析稼働と、拠点都市アクアピアへの変換状況です。
          </p>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="今月の稼働（実績）"
            value={`${boinc.monthActualMinutes} 分`}
            hint={`計画 ${boinc.monthPlannedMinutes} 分 · ${boinc.monthRunCount} 回`}
          />
          <Stat
            label="今月のクレジット"
            value={`${boinc.monthCreditGranted} cs`}
            hint={`タスク ${boinc.monthTasksCompleted} 件`}
          />
          <Stat
            label="累計稼働（実績）"
            value={`${boinc.lifetimeActualMinutes} 分`}
            hint={`計画累計 ${boinc.lifetimePlannedMinutes} 分`}
          />
          <Stat
            label="累計クレジット"
            value={`${boinc.lifetimeCreditGranted} cs`}
            hint={`タスク累計 ${boinc.lifetimeTasksCompleted} 件`}
          />
        </div>

        {settlement && (
          <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.16em] text-emerald-200/80">拠点都市</p>
            <p className="mt-1 text-base font-semibold text-white">
              {settlement.settlementName}（{levelJa(settlement.settlementLevel)}）
            </p>
            <p className="mt-1 text-[12px] text-emerald-50/90">
              累積開拓パワー {settlement.cumulativeMinutes} 分 · 宇宙分析スロット{" "}
              {settlement.analysisSlots}
            </p>
            {settlement.latestHeadline && (
              <p className="mt-2 text-[13px] text-emerald-100">{settlement.latestHeadline}</p>
            )}
            {settlement.latestTopic && (
              <p className="mt-1 text-[12px] leading-relaxed text-slate-300">{settlement.latestTopic}</p>
            )}
            {settlement.facilities.length > 0 && (
              <ul className="mt-3 space-y-1 text-[12px] text-slate-300">
                {settlement.facilities.map((f) => (
                  <li key={f.id}>
                    · {f.name}（{f.location} / {f.levelLabel}）
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="mt-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
            実行履歴
          </p>
          {boinc.runs.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">BOINC 実行履歴はまだありません。</p>
          ) : (
            <div className="mt-2 overflow-x-auto">
              <table className="min-w-full text-left text-[12px]">
                <thead className="text-slate-500">
                  <tr className="border-b border-white/10">
                    <th className="px-2 py-2 font-medium">日時</th>
                    <th className="px-2 py-2 font-medium">計画</th>
                    <th className="px-2 py-2 font-medium">実績</th>
                    <th className="px-2 py-2 font-medium">クレジット</th>
                    <th className="px-2 py-2 font-medium">タスク</th>
                    <th className="px-2 py-2 font-medium">状態</th>
                    <th className="px-2 py-2 font-medium">プロジェクト</th>
                  </tr>
                </thead>
                <tbody>
                  {boinc.runs.map((r) => (
                    <tr key={r.id} className="border-b border-white/5 text-slate-200">
                      <td className="px-2 py-2 whitespace-nowrap">{formatJst(r.createdAt)}</td>
                      <td className="px-2 py-2">{r.plannedMinutes} 分</td>
                      <td className="px-2 py-2">
                        {r.actualMinutes === null ? "—" : `${r.actualMinutes} 分`}
                      </td>
                      <td className="px-2 py-2">
                        {r.creditGranted === null ? "—" : `${r.creditGranted} cs`}
                      </td>
                      <td className="px-2 py-2">
                        {r.tasksCompleted === null ? "—" : r.tasksCompleted}
                      </td>
                      <td className="px-2 py-2">{r.status}</td>
                      <td className="px-2 py-2">
                        {r.projectUrl ? (
                          <a
                            href={r.projectUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-cyan-300 underline"
                          >
                            {r.projectName ?? "project"}
                          </a>
                        ) : (
                          r.projectName ?? "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
