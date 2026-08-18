import { medalUnitScore } from "@/lib/server/soluna-battle";
import { composeDailyNote, createNoteArticleRecord } from "@/lib/server/soluna-note-article";
import { isNotePublishConfigured, noteCreatorUrl, publishNoteArticle } from "@/lib/server/soluna-note-publish";
import {
  getLatestBoincRun,
  getLatestNoteArticle,
  getSystemAssets,
  getSystemHunter,
  getLatestBriefing,
  listSystemMessages,
  saveSystemAssets,
  saveSystemBoincRun,
  saveSystemNoteArticle,
} from "@/lib/server/soluna-system-store";
import type {
  SolunaAssetLedger,
  SolunaBoincRun,
  SolunaJobsState,
  SolunaNewsBriefing,
  SolunaSystemMessage,
} from "@/lib/types/soluna";

const ASSET_PRINCIPAL_YEN = 100_000;

export function boincMinutesFromItems(itemCount: number, victory: boolean): number {
  return Math.max(8, itemCount * 15 + (victory ? 25 : 0));
}

function buildBoincRun(briefingId: string, itemCount: number, victory: boolean): SolunaBoincRun {
  const minutes = boincMinutesFromItems(itemCount, victory);
  return {
    id: `boinc-${briefingId}`,
    briefingId,
    createdAt: new Date().toISOString(),
    minutes,
    itemCount,
    status: "waiting-spec",
    solComment: `アイテム ${itemCount} 個の余熱で、宇宙分析を ${minutes} 分ぶん回すよ。星の計算は討伐の続きだ。`,
    lunaComment: `時間は気分で決めないこと。${minutes} 分、ログを残してから回して。接続手順はこれからね。`,
  };
}

function buildAssets(medalUnits: number): SolunaAssetLedger {
  const cryptoYen = Math.round(ASSET_PRINCIPAL_YEN * 0.55);
  const goldYen = ASSET_PRINCIPAL_YEN - cryptoYen;
  return {
    principalYen: ASSET_PRINCIPAL_YEN,
    medalUnits,
    cryptoYen,
    goldYen,
    status: "waiting-spec",
    solComment: `元手10万円。今日のメダル ${medalUnits} 単位を、仮想通貨枠の『攻めの投資額』に見立てる。`,
    lunaComment: `金は守り。メダルを全部突っ込むのは禁止。詳細な売買ルールはこれから接続するわ。`,
    updatedAt: new Date().toISOString(),
  };
}

export async function buildJobsState(): Promise<SolunaJobsState> {
  const [latestNote, latestBoinc, assets] = await Promise.all([
    getLatestNoteArticle(),
    getLatestBoincRun(),
    getSystemAssets(),
  ]);
  return {
    noteConfigured: isNotePublishConfigured(),
    creatorUrl: noteCreatorUrl(),
    latestNote,
    latestBoinc,
    assets,
  };
}

export async function runDailyAutonomousJobs(options?: {
  force?: boolean;
  briefing?: SolunaNewsBriefing;
  messages?: SolunaSystemMessage[];
}): Promise<SolunaJobsState> {
  const hunter = await getSystemHunter();
  const briefing = options?.briefing ?? (await getLatestBriefing());
  const battle = hunter.battles[hunter.battles.length - 1] ?? null;
  if (!briefing || !battle || battle.briefingId !== briefing.id) {
    return buildJobsState();
  }

  if (!options?.force) {
    const existing = await getLatestNoteArticle();
    if (existing?.briefingId === briefing.id) {
      return buildJobsState();
    }
  }

  const messages =
    options?.messages ??
    (await listSystemMessages()).filter((message) => message.briefingId === briefing.id);
  const todayItems = hunter.inventory.filter((item) => item.briefingId === briefing.id).length;
  const boinc = buildBoincRun(briefing.id, todayItems, battle.outcome === "victory");
  const composed = composeDailyNote({
    briefing,
    battle,
    hunter,
    messages,
    boincMinutes: boinc.minutes,
  });

  let article = createNoteArticleRecord(composed, briefing.id);
  if (isNotePublishConfigured()) {
    try {
      const published = await publishNoteArticle({
        title: composed.title,
        freeHtml: composed.freeHtml,
        paidHtml: composed.paidHtml,
        priceYen: composed.priceYen,
      });
      article = {
        ...article,
        published: true,
        noteKey: published.noteKey,
        noteUrl: published.noteUrl,
      };
    } catch (error) {
      article = {
        ...article,
        published: false,
        error: error instanceof Error ? error.message : "note.com への投稿に失敗しました。",
      };
    }
  } else {
    article = {
      ...article,
      error: "NOTE_COOKIE 未設定のため、アプリ内に原稿だけ保存しました。",
    };
  }

  const assets = buildAssets(medalUnitScore(hunter.medals));
  await saveSystemNoteArticle(article);
  await saveSystemBoincRun(boinc);
  await saveSystemAssets(assets);

  return {
    noteConfigured: isNotePublishConfigured(),
    creatorUrl: noteCreatorUrl(),
    latestNote: article,
    latestBoinc: boinc,
    assets,
  };
}
