"use client";

import {
  stockCategoryLabelJa,
  STOCK_TRADE_RULES,
  type StockTradeRule,
  type StockTradeRuleCategory,
} from "@/lib/stock-trade-rules";

type ApiRule = {
  id: number;
  category: StockTradeRuleCategory;
  categoryLabel: string;
  title: string;
  summary: string;
};

type Props = {
  rules?: ApiRule[] | null;
};

const ORDER: StockTradeRuleCategory[] = [
  "universe",
  "risk",
  "buy",
  "sell",
  "mode",
];

export default function StockTradeRulesPanel({ rules }: Props) {
  const list: Array<StockTradeRule | ApiRule> =
    rules && rules.length > 0 ? rules : STOCK_TRADE_RULES;

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-950/50 p-4 sm:p-5">
      <p className="text-[11px] uppercase tracking-[0.18em] text-cyan-300/80">
        Stocks · Rules
      </p>
      <h2 className="mt-1 text-base font-semibold text-white">
        株式 売買条件（#{list[0]?.id ?? 1}〜#{list[list.length - 1]?.id ?? 19}）
      </h2>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
        仮想通貨（Soluna）と同様に番号付きで整理しています。dry-run /
        発注ログの理由に付く{" "}
        <span className="text-cyan-200/90">#8+#2</span>{" "}
        などと対応します。明日の検証は dry-run のまま実市場を観察する想定です。
      </p>

      <div className="mt-4 space-y-4">
        {ORDER.map((cat) => {
          const rows = list.filter((r) => r.category === cat);
          if (rows.length === 0) return null;
          const label =
            "categoryLabel" in rows[0]
              ? (rows[0] as ApiRule).categoryLabel
              : stockCategoryLabelJa(cat);
          return (
            <div key={cat}>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                {label}
              </p>
              <ol className="space-y-2">
                {rows.map((rule) => (
                  <li
                    key={rule.id}
                    className="rounded-lg border border-white/8 bg-black/15 px-3 py-2 text-[12px] text-slate-300"
                  >
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="font-semibold text-cyan-200">
                        #{rule.id}
                      </span>
                      <span className="font-medium text-white">{rule.title}</span>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                      {rule.summary}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          );
        })}
      </div>
    </section>
  );
}
