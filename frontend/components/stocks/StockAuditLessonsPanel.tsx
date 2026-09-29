"use client";

type LessonVerdict = "good" | "mixed" | "poor";

export type StockAuditLessonView = {
  id: string;
  side: "buy" | "sell";
  symbol: string;
  verdict: LessonVerdict;
  summary: string;
  praises: string[];
  reflections: string[];
  createdAt: string;
};

type Props = {
  lessons?: StockAuditLessonView[] | null;
  lessonNotes?: string[] | null;
};

function verdictLabel(v: LessonVerdict): string {
  switch (v) {
    case "good":
      return "良い点寄り";
    case "poor":
      return "反省寄り";
    default:
      return "混合";
  }
}

function verdictClass(v: LessonVerdict): string {
  switch (v) {
    case "good":
      return "text-emerald-300";
    case "poor":
      return "text-rose-300";
    default:
      return "text-amber-200";
  }
}

function formatAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
  } catch {
    return iso;
  }
}

/** 監査AIの直近レッスン＋昇格ノート */
export default function StockAuditLessonsPanel({
  lessons,
  lessonNotes,
}: Props) {
  const list = lessons ?? [];
  const notes = lessonNotes ?? [];

  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 sm:px-4">
      <p className="text-[11px] uppercase tracking-[0.16em] text-cyan-300/80">
        監査AI · #23/#24
      </p>
      <h3 className="mt-1 text-sm font-semibold text-white">
        売買の良い点・反省
      </h3>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
        dry-run／発注のたびに独立監査が記録。同じ指摘が月内2回以上続くと条件候補に昇格し、次回判断に反映します。
      </p>

      {notes.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {notes.map((n) => (
            <li
              key={n}
              className="rounded-lg border border-amber-400/25 bg-amber-500/10 px-2.5 py-1.5 text-[12px] text-amber-50"
            >
              昇格: {n}
            </li>
          ))}
        </ul>
      )}

      {list.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">
          まだ監査ログがありません。次回 trade ループ以降に溜まります。
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-white/5 rounded-xl border border-white/10">
          {list.map((lesson) => (
            <li key={lesson.id} className="px-3 py-2.5 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium text-white">
                  {lesson.side === "sell" ? "売" : "買"} {lesson.symbol}
                  <span
                    className={`ml-2 text-[11px] ${verdictClass(lesson.verdict)}`}
                  >
                    {verdictLabel(lesson.verdict)}
                  </span>
                </p>
                <p className="text-[11px] text-slate-500">
                  {formatAt(lesson.createdAt)}
                </p>
              </div>
              <p className="mt-1 text-[12px] text-slate-300">{lesson.summary}</p>
              {lesson.praises.length > 0 && (
                <p className="mt-1 text-[11px] text-emerald-200/90">
                  良い点: {lesson.praises.join(" / ")}
                </p>
              )}
              {lesson.reflections.length > 0 && (
                <p className="mt-0.5 text-[11px] text-rose-200/90">
                  反省: {lesson.reflections.join(" / ")}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
