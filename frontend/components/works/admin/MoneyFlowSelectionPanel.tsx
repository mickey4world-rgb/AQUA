import type { NodeSelectionSummary } from "@/lib/works-money-flow-ui";
import { formatMoneyFlowAmount } from "@/lib/works-money-flow-ui";

type MoneyFlowSelectionPanelProps = {
  summary: NodeSelectionSummary;
  unit: string;
  onClear: () => void;
};

export default function MoneyFlowSelectionPanel({
  summary,
  unit,
  onClear,
}: MoneyFlowSelectionPanelProps) {
  return (
    <div className="rounded-2xl border border-cyan-400/25 bg-cyan-500/10 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.22em] text-cyan-200/80">
            選択中 · {summary.kindLabel}
          </p>
          <h3 className="mt-1 text-base font-medium text-white">{summary.name}</h3>
          <p className="mt-1 font-mono text-sm text-cyan-100">
            サンキー上 {formatMoneyFlowAmount(summary.nodeAmount, unit)}
          </p>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="rounded-full border border-white/15 px-3 py-1 text-[11px] text-slate-300 hover:bg-white/10"
        >
          選択解除
        </button>
      </div>

      <p className="mt-3 text-xs text-slate-300">
        明細 {summary.filteredCount.toLocaleString("ja-JP")} 件 · 合計{" "}
        {formatMoneyFlowAmount(summary.filteredAmount, unit)}
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {summary.relatedMinistries.length > 0 ? (
          <SelectionList title="関連府省庁" items={summary.relatedMinistries} />
        ) : null}
        {summary.relatedProjects.length > 0 ? (
          <SelectionList title="関連事業" items={summary.relatedProjects} />
        ) : null}
        {summary.relatedPayees.length > 0 ? (
          <SelectionList title="関連支出先" items={summary.relatedPayees} />
        ) : null}
      </div>
    </div>
  );
}

function SelectionList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{title}</p>
      <ul className="mt-1 space-y-1 text-xs text-slate-300">
        {items.map((item) => (
          <li key={item} className="truncate" title={item}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
