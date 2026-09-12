"use client";

import { useEffect, useMemo, useState } from "react";
import {
  SHOWCASE_RELATION_CARD_SCAN,
  SHOWCASE_RELATION_COLORS,
  SHOWCASE_RELATION_GROUP_LINKS,
  SHOWCASE_RELATION_GROUPS,
  SHOWCASE_RELATION_PERSON_EDGES,
  SHOWCASE_RELATION_TIMELINE_PERSON,
} from "@/lib/showcase-data";

type DemoView = "map" | "timeline" | "camera";

const VIEWS: DemoView[] = ["map", "timeline", "camera"];
const VIEW_LABEL: Record<DemoView, string> = {
  map: "相関図",
  timeline: "勤務履歴",
  camera: "名刺カメラ",
};

function groupCenter(key: string) {
  const g = SHOWCASE_RELATION_GROUPS.find((row) => row.key === key);
  if (!g) return { x: 0, y: 0, bottom: 0, top: 0 };
  return {
    x: g.x + g.w / 2,
    y: g.y + g.h / 2,
    bottom: g.y + g.h,
    top: g.y,
  };
}

function personPoint(id: string) {
  for (const group of SHOWCASE_RELATION_GROUPS) {
    const member = group.members.find((m) => m.id === id);
    if (member) return { x: member.cx, y: member.cy, color: group.color };
  }
  return null;
}

function MapPanel() {
  return (
    <div className="relative overflow-hidden rounded-xl border border-white/10 bg-[#071018]">
      <svg viewBox="0 0 560 390" className="h-[320px] w-full">
        {SHOWCASE_RELATION_GROUP_LINKS.map((link) => {
          const from = groupCenter(link.fromKey);
          const to = groupCenter(link.toKey);
          const midY = (from.bottom + to.top) / 2;
          const d = `M ${from.x} ${from.bottom} L ${from.x} ${midY} L ${to.x} ${midY} L ${to.x} ${to.top}`;
          return (
            <g key={`${link.fromKey}-${link.toKey}`}>
              <path
                d={d}
                fill="none"
                stroke="rgba(120, 130, 148, 0.85)"
                strokeWidth={1.4}
              />
              <text
                x={(from.x + to.x) / 2}
                y={midY - 6}
                textAnchor="middle"
                fontSize="9"
                fill="rgba(148, 163, 184, 0.95)"
              >
                {link.label}
              </text>
            </g>
          );
        })}

        {SHOWCASE_RELATION_GROUPS.map((group) => (
          <g key={group.key}>
            <rect
              x={group.x}
              y={group.y}
              width={group.w}
              height={group.h}
              rx={12}
              ry={12}
              fill={`${group.color}12`}
              stroke={group.color}
              strokeWidth={1.6}
            />
            <text
              x={group.x + 12}
              y={group.y + 12}
              dominantBaseline="hanging"
              fontSize="11"
              fontWeight={600}
              fill={group.color}
            >
              {group.title}（{group.members.length}）
            </text>
          </g>
        ))}

        {SHOWCASE_RELATION_PERSON_EDGES.map((edge) => {
          const from = personPoint(edge.fromId);
          const to = personPoint(edge.toId);
          if (!from || !to) return null;
          return (
            <g key={`${edge.fromId}-${edge.toId}`}>
              <line
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke="rgba(226,232,240,0.45)"
                strokeWidth={1.2}
              />
              <text
                x={(from.x + to.x) / 2}
                y={(from.y + to.y) / 2 - 5}
                textAnchor="middle"
                fontSize="8"
                fill="rgba(203,213,225,0.85)"
              >
                {edge.label}
              </text>
            </g>
          );
        })}

        {SHOWCASE_RELATION_GROUPS.flatMap((group) =>
          group.members.map((member) => (
            <g key={member.id}>
              <circle
                cx={member.cx}
                cy={member.cy}
                r={14}
                fill="#0f172a"
                stroke={group.color}
                strokeWidth={2}
              />
              <text
                x={member.cx}
                y={member.cy + 26}
                textAnchor="middle"
                fontSize="10"
                fill="#e2e8f0"
              >
                {member.name}
              </text>
            </g>
          )),
        )}
      </svg>
      <p className="border-t border-white/8 px-3 py-2 text-[10px] text-slate-500">
        組織枠の中に要員 · 灰色線＝グループ関係 · 細線＝人間関係 · ドラッグ配置はログイン後
      </p>
    </div>
  );
}

function TimelinePanel() {
  const person = SHOWCASE_RELATION_TIMELINE_PERSON;
  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-black/25 p-4">
      <div>
        <p className="text-[10px] uppercase tracking-[0.2em] text-amber-200/70">
          Affiliation Timeline
        </p>
        <h4 className="mt-1 text-base text-white">{person.name}</h4>
        <p className="mt-1 text-[12px] leading-relaxed text-slate-400">{person.note}</p>
      </div>
      <ol className="relative space-y-3 border-l border-white/15 pl-4">
        {person.affiliations.map((aff, index) => {
          const color = SHOWCASE_RELATION_COLORS[aff.orgKind];
          const current = aff.endedOn == null;
          return (
            <li key={`${aff.orgName}-${aff.startedOn}`} className="relative">
              <span
                className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 bg-[#071018]"
                style={{ borderColor: color }}
              />
              <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm text-white">{aff.orgName}</p>
                  {current ? (
                    <span className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-2 py-0.5 text-[10px] text-emerald-100">
                      在籍中
                    </span>
                  ) : (
                    <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-slate-400">
                      異動済
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[12px] text-slate-400">
                  {aff.unitName} · {aff.title}
                </p>
                <p className="mt-1 font-mono text-[11px] text-slate-500">
                  {aff.startedOn} → {aff.endedOn ?? "現在"}
                </p>
                <p className="mt-1 text-[10px] text-slate-500">
                  {index === 0
                    ? "以前の勤務先も履歴として残る"
                    : "時点フィルタで当時の所属色・枠に切替"}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function CameraPanel({ progress }: { progress: number }) {
  const card = SHOWCASE_RELATION_CARD_SCAN;
  const scanning = progress < 55;
  const revealed = progress >= 55;

  return (
    <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
      <div className="relative overflow-hidden rounded-xl border border-amber-300/25 bg-gradient-to-br from-amber-500/15 to-black/40 p-3">
        <div className="flex h-36 items-center justify-center rounded-lg border border-dashed border-amber-200/30 bg-black/30">
          <div className="text-center">
            <svg
              viewBox="0 0 24 24"
              className="mx-auto h-8 w-8 text-amber-100/80"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden
            >
              <path d="M4 8h3l1.5-2h7L17 8h3v11H4V8z" />
              <circle cx="12" cy="13" r="3.5" />
            </svg>
            <p className="mt-2 text-[11px] text-amber-50/90">
              {scanning ? "名刺を読み取り中…" : "抽出完了"}
            </p>
          </div>
        </div>
        {scanning ? (
          <div
            className="pointer-events-none absolute inset-x-3 top-10 h-0.5 bg-amber-200/80 shadow-[0_0_12px_rgba(252,211,77,0.8)] transition-[top] duration-300"
            style={{ top: `${18 + (progress % 55) * 0.9}%` }}
          />
        ) : null}
      </div>
      <div className="rounded-xl border border-white/10 bg-black/25 p-3 text-sm">
        {revealed ? (
          <>
            <p className="text-[10px] uppercase tracking-[0.18em] text-sky-200/70">
              Azure OpenAI Vision · 国内
            </p>
            <p className="mt-2 text-lg text-white">{card.name}</p>
            <p className="mt-1 text-slate-300">{card.orgName}</p>
            <p className="mt-1 text-[12px] text-slate-400">
              {card.unitName} · {card.title}
            </p>
            <p className="mt-1 font-mono text-[11px] text-slate-500">{card.email}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-2 py-0.5 text-[10px] text-amber-50">
                {card.orgKindLabel}
              </span>
              {card.clientLinks.map((link) => (
                <span
                  key={link}
                  className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-slate-300"
                >
                  {link}
                </span>
              ))}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
              スマホカメラ／画像から氏名・組織・部署・役職・メールを抽出し、所属種別と官庁関連も自動判定します。
            </p>
          </>
        ) : (
          <p className="py-8 text-center text-[13px] text-slate-500">
            Vision が名刺テキストを構造化しています…
          </p>
        )}
      </div>
    </div>
  );
}

export default function RelationsShowcaseDemo() {
  const [viewIndex, setViewIndex] = useState(0);
  const [tick, setTick] = useState(0);
  const view = VIEWS[viewIndex];

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTick((n) => n + 1);
    }, 80);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setViewIndex((i) => (i + 1) % VIEWS.length);
      setTick(0);
    }, 6500);
    return () => window.clearInterval(timer);
  }, []);

  const progress = useMemo(() => Math.min(100, tick * 2.2), [tick]);

  return (
    <div className="showcase-demo showcase-demo--relations">
      <div className="showcase-demo__glow" aria-hidden />
      <div className="showcase-demo__frame overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-300/80">
              Relations Workspace
            </p>
            <p className="mt-0.5 text-sm text-slate-300">相関図 · 勤務履歴 · 名刺カメラ</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {VIEWS.map((id, index) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setViewIndex(index);
                  setTick(0);
                }}
                className={`rounded-full px-2.5 py-1 text-[10px] transition ${
                  view === id
                    ? "border border-amber-300/40 bg-amber-300/15 text-amber-50"
                    : "border border-white/10 text-slate-400 hover:border-white/20"
                }`}
              >
                {VIEW_LABEL[id]}
              </button>
            ))}
          </div>
        </div>

        <div className="p-3 sm:p-4">
          {view === "map" ? <MapPanel /> : null}
          {view === "timeline" ? <TimelinePanel /> : null}
          {view === "camera" ? <CameraPanel progress={progress} /> : null}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-white/8 px-4 py-3 text-[10px] text-slate-500">
          <span className="rounded-full border border-white/10 px-2 py-0.5">複数勤務先</span>
          <span className="rounded-full border border-white/10 px-2 py-0.5">組織グループ相関図</span>
          <span className="rounded-full border border-white/10 px-2 py-0.5">時点フィルタ</span>
          <span className="rounded-full border border-white/10 px-2 py-0.5">名刺自動登録</span>
          <span className="rounded-full border border-white/10 px-2 py-0.5">国内 Cosmos / Azure OpenAI</span>
        </div>
      </div>
    </div>
  );
}
