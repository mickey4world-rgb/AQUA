/**
 * 人間チャット用：ソル／ルーナに渡す作戦状況・他アプリコンテキスト
 */
import { APP_LABELS, FEATURE_LABELS } from "@/lib/analytics-constants";
import { getAccessStatsByApp } from "@/lib/server/access-log";
import { formatBriefingForPrompt } from "@/lib/server/soluna-news";
import {
  formatEpisodesForHumanChat,
  formatPersonalitySnapshotForHumanChat,
  findRelevantEpisodes,
  getOrInitSystemPersonality,
} from "@/lib/server/soluna-system-personality";
import { jstDateString } from "@/lib/server/soluna-system-config";
import {
  briefingDocIdForDate,
  getLatestBoincRun,
  getLatestNoteArticle,
  getSystemAssets,
  getSystemHunter,
  getSystemLastRunAt,
  getSystemSettlement,
  listSystemEpisodes,
  listSystemMessages,
} from "@/lib/server/soluna-system-store";
import { getTokenStatsByFeature } from "@/lib/server/token-usage";
import type {
  SolunaAssetLedger,
  SolunaBattleResult,
  SolunaBoincRun,
  SolunaNewsBriefing,
  SolunaNoteArticle,
  SolunaSettlementState,
  SolunaSystemMessage,
} from "@/lib/types/soluna";

export const HUMAN_CHAT_BRIEFING_ADDON = `## ギルド作戦状況の使い方（人間との会話・必須）
あなたは下記の「ギルド作戦状況」「他アプリの最近の動き」を把握済みです。
- ユーザーが討伐・ジョブ・Note・BOINC・拠点・資産（聖なる魔力タンク）・スケジュール・他アプリ（保有株／ディズニー／合議／WORKS／宇宙／コスト／資料）の状況を聞いたら、**必ず下記事実だけ**で具体的に答える。
- 「把握していない」「知らない」「確認できない」などと答えない（データが空の項目だけ「記録がまだない」と言う）。
- 無関係な雑談では無理に持ち出さない。事実のない取引・クレジット・討伐結果は捏造しない。
- 状況説明のときは通常より長くてよい（4〜6行・最大約250字）。短い励ましだけに逃げない。
- **重要**: 取引所名・ブローカー名・API ベンダー名は絶対に口にしない。資産は「聖なる魔力タンク」「召喚獣」「ギルド金庫」など世界観の言葉で語る。`;

function formatJstClock(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ja-JP", {
      timeZone: "Asia/Tokyo",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso.slice(0, 16);
  }
}

function formatDayOpsForHumanChat(input: {
  todayKey: string;
  todayBriefingId: string;
  lastRunAt: string | null;
  briefing: SolunaNewsBriefing | null;
  battle: SolunaBattleResult | null;
}): string {
  const ranToday =
    Boolean(input.lastRunAt) &&
    jstDateString(new Date(input.lastRunAt!)) === input.todayKey;
  const battleToday = input.battle?.briefingId === input.todayBriefingId;
  const briefingToday = input.briefing?.id === input.todayBriefingId;
  return `## ギルド作戦状況（JST ${input.todayKey}・事実）
システム会話（ニュース討伐）最終実行: ${formatJstClock(input.lastRunAt)}（${ranToday ? "本日済み" : "本日まだ／別日"}）
本日ブリーフィング: ${briefingToday ? "あり" : "なし"}（id: ${input.briefing?.id ?? "—"}）
本日の討伐バトル: ${battleToday ? "記録あり" : "本日分なし"}`.trim();
}

function formatBattleForHumanChat(battle: SolunaBattleResult | null): string | null {
  if (!battle) return null;
  const result = battle.outcome === "escape" ? "取り逃がし" : "討伐成功";
  const dayHint =
    battle.briefingId?.replace(/^briefing-/, "") ?? formatJstClock(battle.createdAt);
  return `## 最新ニュース討伐結果（${dayHint}）
ボス: Lv.${battle.bossRank} ${battle.bossName}（${result}）
成績: ${battle.wins ?? "—"}勝${battle.losses ?? "—"}敗
要約: ${battle.newsPlain || battle.impression || "—"}
次の一手: ${battle.nextMove || "—"}
${battle.journey ? `舞台: 『${battle.journey.areaName}』→『${battle.journey.nextAreaName}』` : ""}`.trim();
}

function formatNoteForHumanChat(note: SolunaNoteArticle | null): string {
  if (!note) return "## Note 記事\n最新の投稿記録なし";
  const status = note.published
    ? `公開済み${note.noteUrl ? `（${note.noteUrl}）` : ""}`
    : note.error
      ? `未公開（エラー: ${note.error.slice(0, 80)}）`
      : "下書き／未公開";
  return `## Note 記事
タイトル: ${note.title}
状態: ${status}
紐づく討伐: ${note.briefingId}
作成: ${formatJstClock(note.createdAt)}`.trim();
}

function formatAssetsForHumanChat(assets: SolunaAssetLedger | null): string | null {
  if (!assets) return null;
  const lastTrade = assets.trades[assets.trades.length - 1];
  return `## ギルド資産運用（聖なる魔力タンク）※取引所名はユーザーに言わない
総魔力: ${Math.round(assets.totalYen).toLocaleString("ja-JP")} 円
現金: ${Math.round(assets.cashYen).toLocaleString("ja-JP")} 円 / BTC: ${assets.btcHeld.toFixed(4)} / ETH: ${(assets.ethHeld ?? 0).toFixed(4)} / XRP: ${Math.floor(assets.xrpHeld ?? 0)}
分散: 現金下限・単一銘柄上限・暗号合計上限あり（自動売買は BTC/ETH/XRP）
当月実現損益: ${Math.round(assets.monthlyRealizedPnlYen).toLocaleString("ja-JP")} 円
月次目標（2%）: ${Math.round(assets.monthlyTargetYen).toLocaleString("ja-JP")} 円
おやすみモード（10%超）: ${assets.sleepMode ? "ON" : "OFF"}
状態: ${assets.status} / バトルモード: ${assets.battleMode ?? "defense"}
ソル: ${assets.solComment || "—"}
ルーナ: ${assets.lunaComment || "—"}
${
  lastTrade
    ? `直近取引: ${lastTrade.side} ${lastTrade.product} ${Math.round(lastTrade.sizeJpy).toLocaleString("ja-JP")} 円（${lastTrade.reason}）・${formatJstClock(lastTrade.createdAt)}`
    : "直近取引: なし"
}`.trim();
}

function formatBoincForHumanChat(
  boinc: SolunaBoincRun | null,
  settlement: SolunaSettlementState | null,
): string {
  const lines: string[] = ["## BOINC・拠点都市"];
  if (boinc) {
    lines.push(
      `最新BOINC: 計画 ${boinc.minutes} 分 / 状態 ${boinc.status} / 討伐 ${boinc.briefingId}`,
    );
    if (boinc.result) {
      lines.push(
        `実績: ${boinc.result.runMinutesActual} 分 / ${boinc.result.creditGranted} cs / タスク ${boinc.result.tasksCompleted}（${boinc.result.projectName}）`,
      );
    }
    if (boinc.solComment) lines.push(`ソル: ${boinc.solComment}`);
    if (boinc.lunaComment) lines.push(`ルーナ: ${boinc.lunaComment}`);
  } else {
    lines.push("最新BOINC: まだ記録なし");
  }
  if (settlement) {
    lines.push(
      `拠点: ${settlement.settlementName}（${settlement.settlementLevel}） / 累積開拓 ${settlement.cumulativeMinutes} 分 / 分析スロット ${settlement.analysisSlots}`,
    );
    if (settlement.latestEvent?.headline) {
      lines.push(`最新開拓: ${settlement.latestEvent.headline}`);
    }
  }
  return lines.join("\n");
}

function formatSystemDialogueForHumanChat(
  messages: SolunaSystemMessage[],
  briefingId: string | undefined,
): string | null {
  if (!briefingId) return null;
  const lines = messages
    .filter((m) => m.briefingId === briefingId && (m.role === "sol" || m.role === "luna"))
    .slice(-4)
    .map((m) => {
      const who = m.role === "sol" ? "ソル" : "ルーナ";
      const text = m.content.replace(/\s+/g, " ").trim().slice(0, 90);
      return `- ${who}: ${text}${m.content.length > 90 ? "…" : ""}`;
    });
  if (lines.length === 0) return null;
  return `## 討伐チャットの要点（当日の会話メモ）\n${lines.join("\n")}`;
}

async function formatUserAppsForHumanChat(userId: string): Promise<string> {
  try {
    const end = new Date();
    const start = new Date(end.getTime() - 48 * 60 * 60 * 1000);
    const startIso = start.toISOString();
    const endIso = end.toISOString();
    const [apps, features] = await Promise.all([
      getAccessStatsByApp(userId, startIso, endIso),
      getTokenStatsByFeature(userId, startIso, endIso),
    ]);
    const appLines = apps
      .filter((a) => a.app !== "system" && a.apiCalls > 0)
      .sort((a, b) => b.apiCalls - a.apiCalls)
      .slice(0, 8)
      .map((a) => `- ${APP_LABELS[a.app] ?? a.app}: API ${a.apiCalls} 回`);
    const featureLines = features
      .filter((f) => f.requests > 0 && !f.feature.startsWith("soluna-"))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 6)
      .map((f) => `- ${FEATURE_LABELS[f.feature] ?? f.feature}: ${f.requests} 回`);
    if (appLines.length === 0 && featureLines.length === 0) {
      return `## 他アプリの最近の動き（直近48時間）
このユーザーの他アプリ利用記録はまだ少ない／なし。聞かれたら「最近の利用ログは少ない」と正直に。`;
    }
    return `## 他アプリの最近の動き（直近48時間・このユーザー）
アプリ別:
${appLines.length ? appLines.join("\n") : "- （アクセス集計なし）"}
機能別（AI 利用など）:
${featureLines.length ? featureLines.join("\n") : "- （トークン集計なし）"}
※詳細数値の羅列より「最近よく触っているアプリ」を1〜2個触れる程度でよい。`.trim();
  } catch {
    return `## 他アプリの最近の動き（直近48時間）
利用ログの取得に失敗。聞かれたら「いま集計を取れなかった」とだけ伝える。`;
  }
}

export async function buildHumanChatBriefingSection(
  briefing: SolunaNewsBriefing | null,
  userMessage?: string,
  options?: { userId?: string },
): Promise<string> {
  const blocks: string[] = [];
  const todayKey = jstDateString();
  const todayBriefingId = briefingDocIdForDate();

  if (briefing) {
    blocks.push(formatBriefingForPrompt(briefing));
  }

  const settled = await Promise.allSettled([
    getOrInitSystemPersonality(),
    getSystemHunter(),
    getSystemAssets(),
    getLatestBoincRun(),
    getSystemSettlement(),
    getSystemLastRunAt(),
    getLatestNoteArticle(),
    listSystemMessages(16),
  ]);

  const personality = settled[0].status === "fulfilled" ? settled[0].value : null;
  const hunter = settled[1].status === "fulfilled" ? settled[1].value : null;
  const assets = settled[2].status === "fulfilled" ? settled[2].value : null;
  const boinc = settled[3].status === "fulfilled" ? settled[3].value : null;
  const settlement = settled[4].status === "fulfilled" ? settled[4].value : null;
  const lastRunAt = settled[5].status === "fulfilled" ? settled[5].value : null;
  const note = settled[6].status === "fulfilled" ? settled[6].value : null;
  const systemMessages = settled[7].status === "fulfilled" ? settled[7].value : [];

  const latestBattle =
    hunter && hunter.battles.length > 0 ? hunter.battles[hunter.battles.length - 1] : null;

  blocks.unshift(
    formatDayOpsForHumanChat({
      todayKey,
      todayBriefingId,
      lastRunAt,
      briefing,
      battle: latestBattle,
    }),
  );

  if (personality) {
    blocks.push(formatPersonalitySnapshotForHumanChat(personality));
  }

  const battleBlock = formatBattleForHumanChat(latestBattle);
  if (battleBlock) blocks.push(battleBlock);

  const dialogueBlock = formatSystemDialogueForHumanChat(
    systemMessages,
    latestBattle?.briefingId ?? briefing?.id,
  );
  if (dialogueBlock) blocks.push(dialogueBlock);

  blocks.push(formatNoteForHumanChat(note));

  const assetsBlock = formatAssetsForHumanChat(assets);
  if (assetsBlock) blocks.push(assetsBlock);

  blocks.push(formatBoincForHumanChat(boinc, settlement));

  try {
    const episodes = userMessage
      ? await findRelevantEpisodes(userMessage, 3)
      : await listSystemEpisodes(3);
    const episodeBlock = formatEpisodesForHumanChat(episodes);
    if (episodeBlock) blocks.push(episodeBlock);
  } catch {
    /* optional */
  }

  if (options?.userId) {
    blocks.push(await formatUserAppsForHumanChat(options.userId));
  }

  blocks.push(HUMAN_CHAT_BRIEFING_ADDON);
  return blocks.join("\n\n");
}
