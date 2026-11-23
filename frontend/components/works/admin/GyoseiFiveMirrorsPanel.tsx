"use client";

import type { FiveMirrorId, FiveMirrorsBrief } from "@/lib/gyosei-five-mirrors";

const MIRROR_ACCENT: Record<
  FiveMirrorId,
  { border: string; chip: string; bar: string }
> = {
  source: {
    border: "border-teal-400/35",
    chip: "bg-teal-500/20 text-teal-50",
    bar: "from-teal-400 to-cyan-300",
  },
  volume: {
    border: "border-cyan-400/35",
    chip: "bg-cyan-500/20 text-cyan-50",
    bar: "from-cyan-400 to-sky-300",
  },
  landing: {
    border: "border-amber-400/35",
    chip: "bg-amber-500/20 text-amber-50",
    bar: "from-amber-400 to-yellow-300",
  },
  method: {
    border: "border-violet-400/35",
    chip: "bg-violet-500/20 text-violet-50",
    bar: "from-violet-400 to-fuchsia-300",
  },
  flag: {
    border: "border-rose-400/35",
    chip: "bg-rose-500/20 text-rose-50",
    bar: "from-rose-400 to-orange-300",
  },
};

type Props = {
  brief: FiveMirrorsBrief;
  activeMirror?: FiveMirrorId;
  onSelectMirror?: (id: FiveMirrorId) => void;
  compact?: boolean;
};

export default function GyoseiFiveMirrorsPanel({
  brief,
  activeMirror,
  onSelectMirror,
  compact = false,
}: Props) {
  const current = activeMirror ?? brief.activeMirror;
  const maxContract = Math.max(1, ...brief.contractMix.map((c) => c.amount));

  return (
    <section
      className={`rounded-3xl border border-white/10 bg-slate-950/40 ${compact ? "p-4" : "p-5 sm:p-6"}`}
      aria-labelledby="gyosei-five-mirrors-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-300/80">
            公開五鏡
          </p>
          <h3
            id="gyosei-five-mirrors-heading"
            className="mt-1 text-lg font-semibold text-white sm:text-xl"
          >
            税金の行き先を、5つの問いで読む
          </h3>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-400">
            公式ガイドブックの「経路が分かる」読解順に合わせた通帳です。いまの範囲は
            <span className="text-slate-200"> {brief.scopeLabel}</span>
            （{brief.year}年度）。サンキーは水量・着地の視覚化です。
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {brief.cards.map((card) => {
          const accent = MIRROR_ACCENT[card.id];
          const active = current === card.id;
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => onSelectMirror?.(card.id)}
              className={`rounded-2xl border px-3 py-3 text-left transition ${accent.border} ${
                active
                  ? "bg-white/[0.08] shadow-lg shadow-cyan-500/5"
                  : "bg-white/[0.02] hover:bg-white/[0.05]"
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${accent.chip}`}
                >
                  {card.index}
                </span>
                <span className="text-xs font-semibold text-white">{card.title}</span>
              </div>
              <p className="mt-2 text-[11px] text-slate-400">{card.question}</p>
              <p className="mt-1 text-sm font-medium leading-snug text-slate-100">
                {card.answer}
              </p>
              <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                {card.detail}
              </p>
            </button>
          );
        })}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <p className="text-xs font-semibold text-slate-300">選び方（契約方式のミックス）</p>
          {brief.contractMix.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">契約方式の記載がありません。</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {brief.contractMix.slice(0, 5).map((c) => (
                <li key={c.method}>
                  <div className="flex items-baseline justify-between gap-2 text-[11px]">
                    <span className="truncate text-slate-200">{c.method}</span>
                    <span className="shrink-0 font-mono text-slate-400">
                      {Math.round(c.share * 100)}%
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${MIRROR_ACCENT.method.bar}`}
                      style={{ width: `${(c.amount / maxContract) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <p className="text-xs font-semibold text-slate-300">疑いの旗</p>
          <ul className="mt-3 space-y-2">
            {brief.flags.map((f) => (
              <li
                key={f.title}
                className={`rounded-xl border px-3 py-2 ${
                  f.level === "caution"
                    ? "border-rose-400/35 bg-rose-500/10"
                    : f.level === "watch"
                      ? "border-amber-400/30 bg-amber-500/10"
                      : "border-white/10 bg-white/[0.03]"
                }`}
              >
                <p className="text-xs font-medium text-white">{f.title}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">
                  {f.detail}
                </p>
              </li>
            ))}
          </ul>
          {brief.topPayees[0] && (
            <p className="mt-3 text-[11px] text-slate-500">
              着地上位: {brief.topPayees[0].name}（
              {Math.round(brief.topPayees[0].share * 100)}%）
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {brief.officialLinks.map((link) => (
          <a
            key={link.href}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3 py-1 text-[11px] text-cyan-100 hover:bg-cyan-500/20"
          >
            {link.label} →
          </a>
        ))}
      </div>
    </section>
  );
}
