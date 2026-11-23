"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  JAPAN_PREFECTURES,
  type LifeProximityResult,
} from "@/lib/gyosei-life-proximity";
import { formatMoneyFlowAmount } from "@/lib/works-money-flow-ui";

type Props = {
  year: number;
  /** authenticated: /api/works/money-flow/proximity · public: /api/public/works-money-flow/proximity */
  endpoint: string;
  compact?: boolean;
  defaultPrefecture?: string;
};

export default function GyoseiLifeProximityPanel({
  year,
  endpoint,
  compact = false,
  defaultPrefecture = "東京都",
}: Props) {
  const [prefecture, setPrefecture] = useState(defaultPrefecture);
  const [city, setCity] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LifeProximityResult | null>(null);

  const summary = useMemo(() => {
    if (!result) return null;
    return `${result.prefecture}${result.city ?? ""} · 支出先 ${result.totals.payeeCount} · 事業 ${result.totals.projectCount}`;
  }, [result]);

  async function runSearch(event?: FormEvent) {
    event?.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        year: String(year),
        prefecture,
      });
      if (city.trim()) params.set("city", city.trim());
      const response = await fetch(`${endpoint}?${params.toString()}`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      const payload = (await response.json()) as LifeProximityResult & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || "生活接点の取得に失敗しました");
      }
      setResult(payload);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "生活接点の取得に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      className={`rounded-3xl border border-white/10 bg-slate-950/35 ${compact ? "p-4" : "p-5 sm:p-6"}`}
      aria-labelledby="gyosei-life-proximity-heading"
    >
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-teal-300/80">
          生活接点マップ
        </p>
        <h3
          id="gyosei-life-proximity-heading"
          className="mt-1 text-lg font-semibold text-white sm:text-xl"
        >
          あなたの税金の近さ
        </h3>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-400">
          都道府県（と市区町村）を選ぶと、公開明細の住所・自治体名から「近い着地」を拾います。地図ピンの推測ではなく、CSV の文字一致だけを根拠にします。
        </p>
      </div>

      <form
        onSubmit={runSearch}
        className="mt-4 flex flex-wrap items-end gap-3"
      >
        <label className="text-xs text-slate-400">
          都道府県
          <select
            value={prefecture}
            onChange={(e) => setPrefecture(e.target.value)}
            className="mt-1 block min-w-[9rem] rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
          >
            {JAPAN_PREFECTURES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-400">
          市区町村（任意）
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="例: 横浜市"
            className="mt-1 block min-w-[10rem] rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-slate-600"
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="rounded-full border border-teal-400/35 bg-teal-500/15 px-4 py-2 text-sm text-teal-50 transition hover:bg-teal-500/25 disabled:opacity-50"
        >
          {loading ? "検索中…" : "近い支出を見る"}
        </button>
      </form>

      {error ? (
        <p className="mt-3 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="mt-4 space-y-4">
          <p className="text-sm text-slate-300">
            {summary} · 合計{" "}
            <span className="font-mono text-cyan-100">
              {formatMoneyFlowAmount(result.totals.amount, result.unit)}
            </span>
            {" · "}
            住所一致 {result.totals.addressMatchedFlows.toLocaleString("ja-JP")} 行
          </p>

          {result.emptyReason ? (
            <p className="rounded-2xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-50">
              {result.emptyReason}
            </p>
          ) : null}

          {result.payees.length > 0 ? (
            <div className="overflow-x-auto rounded-2xl border border-white/10">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-white/[0.03] text-[11px] uppercase tracking-[0.14em] text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">近い支出先</th>
                    <th className="px-3 py-2 font-medium">結び方</th>
                    <th className="px-3 py-2 font-medium">主な事業</th>
                    <th className="px-3 py-2 font-medium text-right">金額</th>
                  </tr>
                </thead>
                <tbody>
                  {result.payees.slice(0, compact ? 8 : 15).map((row) => (
                    <tr key={row.payee} className="border-t border-white/5 text-slate-300">
                      <td className="px-3 py-2">
                        <p className="font-medium text-slate-100">{row.payee}</p>
                        {row.sampleAddress ? (
                          <p className="mt-0.5 text-[10px] text-slate-500">
                            {row.sampleAddress}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-[11px] text-slate-400">
                        {row.matchKind === "address"
                          ? "住所"
                          : row.matchKind === "municipal-name"
                            ? "自治体名"
                            : "住所+自治体名"}
                      </td>
                      <td
                        className="px-3 py-2 max-w-[16rem] truncate text-slate-400"
                        title={row.topProjects.join(" / ")}
                      >
                        {row.topProjects[0] ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-cyan-100/90 whitespace-nowrap">
                        {formatMoneyFlowAmount(row.amount, result.unit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {result.projects.length > 0 ? (
            <div>
              <p className="text-xs font-semibold text-slate-400">近い事業（金額順）</p>
              <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                {result.projects.slice(0, compact ? 4 : 8).map((p) => (
                  <li
                    key={p.project}
                    className="rounded-xl border border-white/10 bg-black/20 px-3 py-2"
                  >
                    <p className="text-[11px] text-slate-500">{p.ministry}</p>
                    <p className="text-sm text-slate-100 line-clamp-2">{p.project}</p>
                    <p className="mt-1 font-mono text-[11px] text-cyan-100/80">
                      {formatMoneyFlowAmount(p.amount, result.unit)} · 支出先{" "}
                      {p.payeeCount}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <p className="text-[11px] text-slate-500">
            出典: {result.sourceLabel} · {result.year}年度 · 住所・支出先名の文字一致のみ（ジオコードなし）
          </p>
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-500">
          都道府県を選んで「近い支出を見る」を押すと、{year}年度の公開明細から一覧が出ます。
        </p>
      )}
    </section>
  );
}
