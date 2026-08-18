"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SolunaCharacterAvatar from "@/components/soluna/SolunaCharacterAvatar";
import { SOLUNA_CHARACTER_META } from "@/lib/types/soluna";
import type {
  SolunaBattleResult,
  SolunaHunterState,
  SolunaMedalKind,
  SolunaNewsBriefing,
  SolunaSystemMessage,
  SolunaSystemPersonalityState,
  SolunaSystemStateResponse,
} from "@/lib/types/soluna";

const MEDAL_LABEL: Record<SolunaMedalKind, string> = {
  bronze: "銅",
  silver: "銀",
  gold: "金",
  rainbow: "虹",
};

function MoodBar({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.round(value * 100);
  return (
    <div className="min-w-[7rem] flex-1">
      <div className="mb-1 flex justify-between text-[10px] text-slate-400">
        <span>{label}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function HunterHud({ hunter }: { hunter: SolunaHunterState }) {
  const xpPct = Math.round((hunter.xpIntoLevel / Math.max(1, hunter.xpForNext)) * 100);
  const recentItems = hunter.inventory.slice(-4).reverse();

  return (
    <div className="mt-3 rounded-xl border border-amber-300/20 bg-gradient-to-r from-amber-500/10 to-indigo-500/10 p-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[10px] tracking-[0.18em] text-amber-200/70 uppercase">Party Hunter</p>
          <p className="text-lg font-semibold text-white">Lv.{hunter.level}</p>
        </div>
        <p className="font-mono text-[11px] text-amber-100/80">
          EXP {hunter.xpIntoLevel}/{hunter.xpForNext}
        </p>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/30">
        <div className="h-full rounded-full bg-gradient-to-r from-amber-300 to-violet-300" style={{ width: `${xpPct}%` }} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-200">
        {(Object.keys(MEDAL_LABEL) as SolunaMedalKind[]).map((kind) => (
          <span key={kind} className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5">
            {MEDAL_LABEL[kind]} {hunter.medals[kind]}
          </span>
        ))}
      </div>
      {recentItems.length > 0 && (
        <p className="mt-2 text-[11px] text-slate-400">
          最近の入手: {recentItems.map((item) => item.name).join(" · ")}
        </p>
      )}
    </div>
  );
}

function MonsterBoard({
  briefing,
  battle,
}: {
  briefing: SolunaNewsBriefing;
  battle: SolunaBattleResult | null;
}) {
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      {briefing.items.map((item) => {
        const monster = item.monster;
        const isBoss = Boolean(
          monster && battle && battle.briefingId === briefing.id && monster.name === battle.bossName,
        );
        const defeated = isBoss && battle?.outcome === "victory";
        const escaped = isBoss && battle?.outcome === "escape";
        const hpPct = defeated ? 0 : escaped ? 38 : 100;
        return (
          <article
            key={`${item.keyword}-${item.title}`}
            className={`rounded-xl border px-3 py-2.5 ${
              defeated
                ? "border-amber-300/25 bg-amber-500/[0.08]"
                : escaped
                  ? "border-slate-400/20 bg-slate-500/10"
                  : "border-rose-300/20 bg-rose-500/[0.07]"
            }`}
          >
            <p className="text-[10px] tracking-[0.16em] text-rose-200/70 uppercase">
              {monster ? `Lv.${monster.rank} ${monster.speciesLabel}` : item.keyword}
              {defeated ? " · 討伐済" : escaped ? " · 逃走" : ""}
            </p>
            <h4 className="mt-0.5 text-sm font-semibold text-rose-50">
              {monster?.name ?? item.title}
            </h4>
            {monster && (
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/30">
                <div
                  className={`h-full rounded-full ${defeated ? "bg-amber-300" : "bg-rose-400"}`}
                  style={{ width: `${hpPct}%` }}
                />
              </div>
            )}
            <p className="mt-2 text-[11px] leading-relaxed text-slate-300">{item.summary}</p>
            <p className="mt-1 text-[10px] text-slate-500">正体: {item.title}</p>
            {monster && (
              <p className="mt-1 text-[10px] text-amber-200/70">弱点: {monster.weakness}</p>
            )}
          </article>
        );
      })}
    </div>
  );
}

function BattleRecapCard({ battle }: { battle: SolunaBattleResult }) {
  const victory = battle.outcome === "victory";
  return (
    <div
      className={`mt-3 rounded-xl border px-3 py-3 ${
        victory
          ? "border-amber-300/25 bg-amber-400/10"
          : "border-slate-400/20 bg-slate-500/10"
      }`}
    >
      <p className="text-[10px] tracking-[0.18em] uppercase text-slate-400">Battle Result</p>
      <p className="mt-1 text-sm font-semibold text-white">
        {victory ? "討伐成功" : "逃走"} — Lv.{battle.bossRank} {battle.bossName}
      </p>
      <p className="mt-2 text-[12px] leading-relaxed text-slate-200">{battle.impression}</p>
      <p className="mt-2 text-[12px] text-violet-100/90">次の一手: {battle.nextMove}</p>
      <p className="mt-2 text-[10px] text-slate-400">
        {battle.loot.medal ? `${MEDAL_LABEL[battle.loot.medal]}メダル · ` : ""}
        {battle.loot.itemName ? `${battle.loot.itemName} · ` : ""}
        EXP +{battle.loot.xpGained}
        {battle.loot.itemFlavor ? ` — ${battle.loot.itemFlavor}` : ""}
      </p>
    </div>
  );
}

function PersonalityPanel({ personality }: { personality: SolunaSystemPersonalityState }) {
  return (
    <div className="mt-3 grid gap-3 rounded-xl border border-violet-300/15 bg-black/20 p-3 sm:grid-cols-2">
      <div>
        <p className="text-[10px] tracking-[0.18em] text-amber-200/70 uppercase">ソル · 気分</p>
        <div className="mt-2 flex gap-3">
          <MoodBar label="happiness" value={personality.sol.mood.happiness} color="bg-amber-300" />
          <MoodBar label="energy" value={personality.sol.mood.energy} color="bg-orange-300" />
        </div>
      </div>
      <div>
        <p className="text-[10px] tracking-[0.18em] text-indigo-200/70 uppercase">ルーナ · 気分</p>
        <div className="mt-2 flex gap-3">
          <MoodBar label="happiness" value={personality.luna.mood.happiness} color="bg-indigo-300" />
          <MoodBar label="energy" value={personality.luna.mood.energy} color="bg-violet-300" />
        </div>
      </div>
    </div>
  );
}

type SolunaSystemChatPanelProps = {
  embedded?: boolean;
};

export default function SolunaSystemChatPanel({ embedded = false }: SolunaSystemChatPanelProps) {
  const [state, setState] = useState<SolunaSystemStateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadState = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/soluna/system");
      const data = (await res.json()) as SolunaSystemStateResponse & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "討伐ログの読み込みに失敗しました");
        return;
      }
      setState(data);
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state?.messages]);

  if (loading) {
    return (
      <div className={`text-center text-sm text-slate-400 ${embedded ? "py-12" : "rounded-2xl border border-white/10 bg-white/[0.03] p-8"}`}>
        討伐ログを読み込んでいます…
      </div>
    );
  }

  if (error || !state) {
    return (
      <div className={`text-sm text-rose-100 ${embedded ? "py-6" : "rounded-2xl border border-rose-400/30 bg-rose-500/10 p-6"}`}>
        {error ?? "討伐ログを読み込めませんでした。"}
      </div>
    );
  }

  const body = (
    <>
      <div className="relative">
        <p className="text-[10px] tracking-[0.28em] text-violet-200/70 uppercase">News Hunt</p>
        <h3 className="mt-1 text-lg font-semibold text-white">ソル ↔ ルーナ ニュース討伐</h3>
        <p className="mt-1 text-[11px] text-slate-400">
          毎朝9時、最新ニュースがモンスターになって現れる。2人の議論が深まるほど強敵を倒し、逃げることもある。
        </p>
        {state.hunter && <HunterHud hunter={state.hunter} />}
        {state.briefing && <MonsterBoard briefing={state.briefing} battle={state.latestBattle} />}
        {state.latestBattle && <BattleRecapCard battle={state.latestBattle} />}
        {state.personality && <PersonalityPanel personality={state.personality} />}
        {state.recentEpisodes.length > 0 && (
          <div className="mt-3 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2">
            <p className="text-[10px] tracking-[0.18em] text-slate-400 uppercase">昨日までの記憶</p>
            <ul className="mt-2 space-y-1 text-[11px] text-slate-300">
              {state.recentEpisodes.slice(0, 3).map((episode) => (
                <li key={episode.id}>
                  <span className="text-violet-200/80">{episode.highlight}</span>
                  <span className="text-slate-500"> — {episode.summary}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="relative mt-5 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        {state.messages.length === 0 && (
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-5 text-sm text-slate-300">
            まだ討伐ログはありません。毎朝9時（JST）に自動でバトルが始まります。
            {!state.configured && (
              <p className="mt-2 text-xs text-amber-200/80">
                Claude と Azure OpenAI の両方が必要です。
              </p>
            )}
          </div>
        )}

        {state.messages.map((message: SolunaSystemMessage) => {
          if (message.role === "system") {
            const recap = message.kind === "battle-recap" || message.content.startsWith("⚔️");
            return (
              <div key={message.id} className="flex justify-center">
                <p
                  className={`max-w-[92%] whitespace-pre-wrap px-4 py-2 text-center text-[11px] leading-relaxed ${
                    recap
                      ? "rounded-2xl border border-amber-300/25 bg-amber-400/10 text-amber-50"
                      : "rounded-full border border-violet-300/20 bg-violet-400/10 text-violet-100/90"
                  }`}
                >
                  {message.content}
                </p>
              </div>
            );
          }

          const isSol = message.role === "sol";
          const meta = SOLUNA_CHARACTER_META[isSol ? "sol" : "luna"];

          return (
            <div key={message.id} className="flex min-w-0 items-start gap-2.5">
              <SolunaCharacterAvatar
                character={isSol ? "sol" : "luna"}
                stage={{ id: "system", label: "Hunter", min: 0, max: 100 }}
                mood="idle"
                size="sm"
              />
              <div
                className={`min-w-0 flex-1 rounded-2xl border px-4 py-3 text-sm leading-relaxed ${
                  isSol
                    ? "border-amber-300/20 bg-amber-400/[0.07] text-amber-50"
                    : "border-indigo-300/20 bg-indigo-400/[0.07] text-indigo-50"
                }`}
              >
                <p className="mb-1 text-[10px] font-medium tracking-[0.18em] uppercase opacity-70">
                  {meta.nameJa}
                  {isSol ? " · アタッカー" : " · ガーディアン"}
                </p>
                <p className="whitespace-pre-wrap break-words">{message.content}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </>
  );

  if (embedded) {
    return <div className="relative flex min-h-[30rem] flex-1 flex-col">{body}</div>;
  }

  return (
    <section className="relative flex min-h-[34rem] flex-col overflow-hidden rounded-2xl border border-violet-400/20 bg-violet-500/[0.04] p-5 backdrop-blur-md">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_90%_0%,rgba(129,140,248,0.14),transparent_45%),radial-gradient(ellipse_at_10%_0%,rgba(251,191,36,0.1),transparent_42%)]" />
      {body}
    </section>
  );
}
