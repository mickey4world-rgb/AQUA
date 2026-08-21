"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import SolunaCharacterAvatar from "@/components/soluna/SolunaCharacterAvatar";
import { SOLUNA_CHARACTER_META } from "@/lib/types/soluna";
import type {
  SolunaBattleResult,
  SolunaHunterState,
  SolunaJobsState,
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

function formatHuntDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ja-JP", {
    month: "numeric",
    day: "numeric",
    timeZone: "Asia/Tokyo",
  });
}

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
  const xpInto = hunter.xpIntoLevel ?? 0;
  const xpNext = Math.max(1, hunter.xpForNext ?? 1);
  const xpPct = Math.round((xpInto / xpNext) * 100);
  const medals = hunter.medals ?? { bronze: 0, silver: 0, gold: 0, rainbow: 0 };

  return (
    <div className="mt-3 rounded-xl border border-amber-300/20 bg-gradient-to-r from-amber-500/10 to-indigo-500/10 p-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[10px] tracking-[0.18em] text-amber-200/70 uppercase">Party</p>
          <p className="text-lg font-semibold text-white">ハンター Lv.{hunter.level ?? 1}</p>
        </div>
        <p className="font-mono text-[11px] text-amber-100/80">
          EXP {xpInto}/{xpNext}
        </p>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/30">
        <div className="h-full rounded-full bg-gradient-to-r from-amber-300 to-violet-300" style={{ width: `${xpPct}%` }} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-200">
        {(Object.keys(MEDAL_LABEL) as SolunaMedalKind[]).map((kind) => (
          <span key={kind} className="rounded-full border border-white/10 bg-black/20 px-2 py-0.5">
            {MEDAL_LABEL[kind]} {medals[kind] ?? 0}
          </span>
        ))}
      </div>
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
    <div className="mt-3 space-y-2">
      {battle?.journey && battle.briefingId === briefing.id && (
        <p className="rounded-lg border border-emerald-300/20 bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-100">
          🗺️ 現在地『{battle.journey.areaName}』（{battle.journey.regionLabel}）→ 次は『
          {battle.journey.nextAreaName}』
          {battle.wins !== undefined
            ? ` · 本日 ${battle.wins}勝${battle.losses ?? 0}敗`
            : ""}
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {(briefing.items ?? []).map((item) => {
          const monster = item.monster;
          const isBoss = Boolean(
            monster && battle && battle.briefingId === briefing.id && monster.name === battle.bossName,
          );
          const enc = battle?.encounters?.find((row) => row.monsterName === monster?.name);
          const defeated =
            (isBoss && battle?.outcome === "victory") || enc?.outcome === "victory";
          const escaped =
            (isBoss && battle?.outcome === "escape") || enc?.outcome === "escape";
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
                {isBoss ? "大ボス · " : enc ? "小物 · " : ""}
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
              <p className="mt-2 text-[12px] leading-relaxed text-slate-200">{item.summary}</p>
              <p className="mt-1 text-[11px] text-slate-400">ニュース: {item.title}</p>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function RecapRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] gap-2 py-1.5 sm:grid-cols-[6.5rem_1fr]">
      <dt className="text-[11px] font-medium text-slate-400">{label}</dt>
      <dd className="text-[13px] leading-relaxed text-slate-100">{children}</dd>
    </div>
  );
}

function BattleRecapCard({ battle }: { battle: SolunaBattleResult }) {
  const victory = battle.outcome === "victory";
  const loot = battle.loot ?? { medal: null, itemName: null, itemFlavor: null, xpGained: 0 };
  const medal = loot.medal ? `${MEDAL_LABEL[loot.medal]}メダル` : "なし";
  const item = loot.itemName
    ? `${loot.itemName}${loot.itemFlavor ? `（${loot.itemFlavor}）` : ""}`
    : "なし";

  return (
    <section
      className={`mt-4 rounded-2xl border px-4 py-4 ${
        victory ? "border-amber-300/30 bg-amber-400/10" : "border-slate-400/25 bg-slate-500/10"
      }`}
    >
      <p className="text-[10px] tracking-[0.18em] uppercase text-slate-400">今回のバトル結果</p>
      <p className={`mt-1 text-xl font-semibold ${victory ? "text-amber-100" : "text-slate-100"}`}>
        {victory ? "討伐成功" : "取り逃がし"}
      </p>
      <dl className="mt-3 divide-y divide-white/8">
        {battle.journey && (
          <RecapRow label="舞台">
            『{battle.journey.areaName}』（{battle.journey.regionLabel}）→ 次『
            {battle.journey.nextAreaName}』
          </RecapRow>
        )}
        {battle.wins !== undefined && (
          <RecapRow label="複数戦">
            {battle.wins}勝{battle.losses ?? 0}敗 / 物語ゴールド +{battle.goldFlavorTotal ?? 0}
          </RecapRow>
        )}
        <RecapRow label="大ボス">
          Lv.{battle.bossRank} {battle.bossName}
        </RecapRow>
        <RecapRow label="ニュース">
          {battle.newsPlain || battle.newsTitle || battle.bossName}
          {battle.newsTitle && battle.newsPlain ? (
            <span className="mt-1 block text-[11px] text-slate-400">{battle.newsTitle}</span>
          ) : null}
        </RecapRow>
        <RecapRow label="なぜこうなった">{battle.outcomeWhy || battle.impression || "—"}</RecapRow>
        <RecapRow label="2人の感想">{battle.impression || "—"}</RecapRow>
        <RecapRow label="入手">
          {medal} ／ {item} ／ 経験値 +{loot.xpGained ?? 0}
          <span className="mt-1 block text-[11px] text-slate-400">
            ハンター Lv.{battle.levelAfter ?? "—"}
          </span>
        </RecapRow>
        <RecapRow label="次に見ること">{battle.nextMove || "—"}</RecapRow>
      </dl>
    </section>
  );
}

function PastHuntList({ battles }: { battles: SolunaBattleResult[] }) {
  if (battles.length === 0) return null;

  return (
    <section className="mt-5 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-3">
      <p className="text-[10px] tracking-[0.18em] text-slate-400 uppercase">過去の討伐</p>
      <ul className="mt-2 divide-y divide-white/8">
        {battles.map((battle) => (
          <li key={battle.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2 text-[12px]">
            <span className="text-slate-400">{formatHuntDate(battle.createdAt)}</span>
            <span className="min-w-0 flex-1 text-slate-200">
              {battle.outcome === "victory" ? "討伐" : "逃走"} · Lv.{battle.bossRank} {battle.bossName}
            </span>
            <span className="text-[11px] text-slate-500">
              {battle.loot?.medal ? `${MEDAL_LABEL[battle.loot.medal]} · ` : ""}
              EXP +{battle.loot?.xpGained ?? 0}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function JobsDesk({ jobs }: { jobs: SolunaJobsState }) {
  const note = jobs.latestNote;
  const boinc = jobs.latestBoinc;
  const assets = jobs.assets;
  const settlement = jobs.settlement;
  const levelJa =
    settlement?.settlementLevel === "city"
      ? "都市"
      : settlement?.settlementLevel === "town"
        ? "町"
        : "村";

  return (
    <section className="mt-5 rounded-2xl border border-cyan-300/20 bg-cyan-500/[0.06] px-4 py-4">
      <p className="text-[10px] tracking-[0.18em] text-cyan-200/80 uppercase">Autonomous Jobs</p>
      <h4 className="mt-1 text-base font-semibold text-white">2人の仕事</h4>
      <p className="mt-1 text-[12px] leading-relaxed text-slate-400">
        討伐のあと、ソルとルーナが勝手に回す3つの仕事です。有料購読が回るほど、拠点都市の開拓が進みます。
      </p>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <article className="rounded-xl border border-white/10 bg-black/20 p-3">
          <p className="text-[11px] font-medium text-cyan-100">① Note 公開</p>
          {note ? (
            <>
              <p className="mt-2 text-[13px] font-semibold text-white">{note.title}</p>
              <p className="mt-1 text-[11px] text-slate-400">
                {note.published ? "有料記事として投稿済み" : "原稿保存（未投稿）"}
                {note.priceYen > 0 ? ` · ${note.priceYen}円` : " · 無料"}
              </p>
              {note.noteUrl && (
                <a
                  href={note.noteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-[12px] text-cyan-200 underline"
                >
                  note.com で読む
                </a>
              )}
              {note.error && <p className="mt-2 text-[11px] text-amber-200/80">{note.error}</p>}
              <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-[11px] leading-relaxed text-slate-300">
                {note.freeBody}
              </p>
            </>
          ) : (
            <p className="mt-2 text-[12px] text-slate-400">
              まだ投稿はありません。朝の討伐後に自動で原稿を作ります。
              {!jobs.noteConfigured && " NOTE_COOKIE を設定すると note.com へ公開します。"}
            </p>
          )}
          {jobs.creatorUrl && !note?.noteUrl && (
            <a
              href={jobs.creatorUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-[12px] text-cyan-200 underline"
            >
              Note アカウント
            </a>
          )}
        </article>

        <article className="rounded-xl border border-white/10 bg-black/20 p-3">
          <p className="text-[11px] font-medium text-cyan-100">② 拠点開拓 · 街づくり</p>
          {settlement?.latestEvent ? (
            <>
              <p className="mt-2 text-[13px] font-semibold text-white">
                {settlement.settlementName}（{levelJa}）
              </p>
              <p className="mt-1 text-[11px] text-slate-300">
                本日 {settlement.latestEvent.todayMinutes} 分 / 累積 {settlement.cumulativeMinutes} 分 ·
                スロット {settlement.analysisSlots}
              </p>
              <p className="mt-2 text-[12px] leading-relaxed text-emerald-100/90">
                {settlement.latestEvent.headline}
              </p>
              <p className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-slate-300">
                {settlement.latestEvent.topic}
              </p>
              {Array.isArray(settlement.facilities) && settlement.facilities.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-[10px] text-slate-400">
                  {settlement.facilities.slice(-3).map((f) => (
                    <li key={f.id}>
                      · {f.name}（{f.levelLabel}）
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-[12px] leading-relaxed text-amber-50/90">
                ⚔️ {settlement.latestEvent.solComment}
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-indigo-50/90">
                📖 {settlement.latestEvent.lunaComment}
              </p>
            </>
          ) : boinc ? (
            <>
              <p className="mt-2 text-[13px] text-white">
                宇宙分析 {boinc.minutes} 分 → 開拓パワー待機中
              </p>
              <p className="mt-1 text-[11px] text-amber-200/80">
                {boinc.status === "done" ? "BOINC 完了" : "GitHub Actions で実行中 / 待機中"}
              </p>
            </>
          ) : (
            <p className="mt-2 text-[12px] text-slate-400">
              BOINC の解析分が街の施設建設に変わります。最初の目標は魔導風車【エウルス】。
            </p>
          )}
          {boinc?.result && (
            <p className="mt-2 text-[10px] text-slate-500">
              裏ログ: {boinc.result.runMinutesActual}分 / {boinc.result.creditGranted} cobblestones
            </p>
          )}
        </article>

        <article className="rounded-xl border border-white/10 bg-black/20 p-3">
          <p className="text-[11px] font-medium text-cyan-100">③ 資産運用 · 召喚獣育成</p>
          <p className="mt-1 text-[10px] text-slate-500">
            1時間ごと · BTC/ETH をスコア比較して分散売買（現金下限・単一/合計上限あり）
          </p>
          {assets ? (
            <>
              {assets.battleMode === "attack" && (
                <p className="mt-2 text-[11px] font-semibold text-amber-300">
                  🌟 前日利益バフ発動中（魔力増幅＋20%）
                </p>
              )}
              {assets.battleMode === "defense" && assets.status === "done" && (
                <p className="mt-2 text-[11px] font-semibold text-sky-300">
                  🛡️ 防御モード · 黄金の守護巨兵で足元固め
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-3">
                <div>
                  <p className="text-[10px] text-slate-400">総魔力（評価額）</p>
                  <p className="text-[15px] font-bold text-white">
                    {(assets.totalYen ?? 0).toLocaleString("ja-JP")} MP
                  </p>
                  {typeof assets.previousTotalYen === "number" && (
                    <p className="text-[10px] text-slate-400">
                      前日比{" "}
                      {(() => {
                        const d = Math.round((assets.totalYen ?? 0) - assets.previousTotalYen);
                        return `${d >= 0 ? "+" : ""}${d.toLocaleString("ja-JP")} MP`;
                      })()}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">🤖 黄金の守護巨兵</p>
                  <p className="text-[13px] text-slate-200">
                    Lv.{(((assets.cashYen ?? 0) / 10000) || 0).toFixed(1)} ·{" "}
                    {(assets.cashYen ?? 0).toLocaleString("ja-JP")} MP
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">🐉 雷轟の蒼竜</p>
                  <p className="text-[13px] text-slate-200">
                    Lv.{((((assets.btcHeld ?? 0) * (assets.btcPriceYen || 0)) / 10000) || 0).toFixed(1)} ·{" "}
                    {(assets.btcHeld ?? 0).toFixed(4)} BTC
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">🦅 蒼穹の不死鳥</p>
                  <p className="text-[13px] text-slate-200">
                    Lv.{((((assets.ethHeld ?? 0) * (assets.ethPriceYen || 0)) / 10000) || 0).toFixed(1)} ·{" "}
                    {(assets.ethHeld ?? 0).toFixed(4)} ETH
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400">🏅 ジパング防衛枠</p>
                  <p className="text-[13px] text-slate-200">
                    {(assets.zpgHeld ?? 0) > 0
                      ? `${(assets.zpgHeld ?? 0).toFixed(4)} ZPG（監視）`
                      : "現金袖 ~12%（自動売買API非対応）"}
                  </p>
                </div>
              </div>

              <div className="mt-2">
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>
                    討伐報酬 {(assets.monthlyRealizedPnlYen ?? 0).toLocaleString("ja-JP")} ゴールド
                  </span>
                  <span>
                    目標(2%) {(assets.monthlyTargetYen ?? 0).toLocaleString("ja-JP")} / おやすみは10%超
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`h-full rounded-full transition-all ${assets.sleepMode ? "bg-emerald-400" : "bg-amber-400"}`}
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round(
                          ((assets.monthlyRealizedPnlYen ?? 0) /
                            Math.max(1, assets.monthlyTargetYen ?? 1)) *
                            100,
                        ),
                      )}%`,
                    }}
                  />
                </div>
                {assets.sleepMode && (
                  <p className="mt-1 text-[11px] font-semibold text-emerald-300">
                    🌙 月次利益10%超 · おやすみモード
                  </p>
                )}
              </div>

              {Array.isArray(assets.trades) && assets.trades.length > 0 && (
                <div className="mt-2">
                  <p className="text-[10px] text-slate-400">直近の召喚／解呪</p>
                  <div className="mt-1 space-y-1">
                    {assets.trades.slice(-3).reverse().map((t) => (
                      <div key={t.id} className="flex items-center gap-2 text-[11px]">
                        <span className={`font-semibold ${t.side === "BUY" ? "text-blue-300" : "text-rose-300"}`}>
                          {t.side === "BUY" ? "召喚" : "解呪"}
                        </span>
                        <span className="text-slate-300">
                          {(t.product ?? "BTC_JPY").replace("_JPY", "")} {(t.sizeJpy ?? 0).toLocaleString()} MP
                        </span>
                        <span className="text-slate-400">@ {(t.priceBtc ?? 0).toLocaleString()}</span>
                        {t.realizedPnlJpy !== undefined && (
                          <span className={t.realizedPnlJpy >= 0 ? "text-emerald-300" : "text-rose-300"}>
                            {t.realizedPnlJpy >= 0 ? "+" : ""}
                            {t.realizedPnlJpy.toLocaleString()} ゴールド
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {assets.status === "waiting-spec" && (
                <p className="mt-2 text-[11px] text-amber-200/80">
                  {jobs.bitFlyerConfigured
                    ? "⏳ 接続設定済み。口座同期待ち（Actions の Asset Trade を1回実行するか、毎時クロンを待つ）"
                    : "⏳ 魔力充填待ち / 資産運用APIの接続設定が必要です"}
                </p>
              )}

              <p className="mt-2 text-[12px] leading-relaxed text-amber-50/90">⚔️ {assets.solComment}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-indigo-50/90">📖 {assets.lunaComment}</p>
            </>
          ) : (
            <p className="mt-2 text-[12px] text-slate-400">
              聖なる魔力タンク 100,000 MP。雷轟の蒼竜（BTC）育成＆黄金の守護巨兵（現金防衛）。前日利益でバフ発動。
            </p>
          )}
        </article>
      </div>
    </section>
  );
}

function PersonalityPanel({ personality }: { personality: SolunaSystemPersonalityState }) {
  const solMood = personality.sol?.mood ?? { happiness: 0.5, energy: 0.5 };
  const lunaMood = personality.luna?.mood ?? { happiness: 0.5, energy: 0.5 };
  return (
    <div className="mt-4 grid gap-3 rounded-xl border border-violet-300/15 bg-black/20 p-3 sm:grid-cols-2">
      <div>
        <p className="text-[10px] tracking-[0.18em] text-amber-200/70 uppercase">ソル · 気分</p>
        <div className="mt-2 flex gap-3">
          <MoodBar label="happiness" value={solMood.happiness ?? 0.5} color="bg-amber-300" />
          <MoodBar label="energy" value={solMood.energy ?? 0.5} color="bg-orange-300" />
        </div>
      </div>
      <div>
        <p className="text-[10px] tracking-[0.18em] text-indigo-200/70 uppercase">ルーナ · 気分</p>
        <div className="mt-2 flex gap-3">
          <MoodBar label="happiness" value={lunaMood.happiness ?? 0.5} color="bg-indigo-300" />
          <MoodBar label="energy" value={lunaMood.energy ?? 0.5} color="bg-violet-300" />
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

  const latestBriefingId = state?.briefing?.id ?? state?.latestBattle?.briefingId ?? null;
  const latestMessages = useMemo(() => {
    if (!state) return [];
    return state.messages.filter(
      (message) =>
        message.briefingId === latestBriefingId &&
        message.kind !== "battle-recap" &&
        (message.role === "sol" || message.role === "luna" || message.kind === "narration"),
    );
  }, [state, latestBriefingId]);

  const pastBattles = useMemo(() => {
    const battles = state?.hunter?.battles ?? [];
    const latestId = state?.latestBattle?.id;
    return [...battles]
      .filter((battle) => battle.id !== latestId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [state]);

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
    <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
      <p className="text-[10px] tracking-[0.28em] text-violet-200/70 uppercase">News Hunt</p>
      <h3 className="mt-1 text-lg font-semibold text-white">ソル ↔ ルーナ ニュース討伐</h3>
      <p className="mt-1 text-[12px] leading-relaxed text-slate-400">
        毎朝9時、最新ニュースを2人が分かりやすく読み解きます。たとえで興味を引き、議論が深まると討伐。まとまらないと逃げられます。
      </p>

      {state.hunter && <HunterHud hunter={state.hunter} />}
      {state.briefing && <MonsterBoard briefing={state.briefing} battle={state.latestBattle} />}
      {state.latestBattle && <BattleRecapCard battle={state.latestBattle} />}

      <section className="mt-5">
        <p className="text-[10px] tracking-[0.18em] text-slate-400 uppercase">今回の議論</p>
        <div className="mt-3 space-y-4">
          {latestMessages.length === 0 && (
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-5 text-sm text-slate-300">
              まだ今回の議論はありません。毎朝9時（JST）に自動で始まります。
              {!state.configured && (
                <p className="mt-2 text-xs text-amber-200/80">Claude と Azure OpenAI の両方が必要です。</p>
              )}
            </div>
          )}

          {latestMessages.map((message: SolunaSystemMessage) => {
            if (message.role === "system") {
              return (
                <div key={message.id} className="flex justify-center">
                  <p className="max-w-[92%] rounded-full border border-violet-300/20 bg-violet-400/10 px-4 py-1.5 text-center text-[11px] text-violet-100/90">
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
                    {isSol ? " · 解説" : " · 補強"}
                  </p>
                  <p className="whitespace-pre-wrap break-words">{message.content}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <PastHuntList battles={pastBattles} />
      {state.jobs && <JobsDesk jobs={state.jobs} />}
      {state.personality && <PersonalityPanel personality={state.personality} />}
    </div>
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
