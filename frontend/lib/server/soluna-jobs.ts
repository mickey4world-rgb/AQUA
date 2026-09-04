import { medalUnitScore } from "@/lib/server/soluna-battle";
import { isBitFlyerEnabled, runDailyAssetTrade } from "@/lib/server/soluna-asset-trade";
import { composeDailyNote, createNoteArticleRecord } from "@/lib/server/soluna-note-article";
import { isNotePublishConfigured, noteCreatorUrl, publishNoteArticle } from "@/lib/server/soluna-note-publish";
import { advanceSettlement } from "@/lib/server/soluna-settlement";
import {
  getLatestBoincRun,
  getLatestNoteArticle,
  getSystemAssets,
  getSystemHunter,
  getSystemSettlement,
  getLatestBriefing,
  listSystemMessages,
  saveSystemAssets,
  saveSystemBoincRun,
  saveSystemNoteArticle,
  saveSystemSettlement,
} from "@/lib/server/soluna-system-store";
import type {
  SolunaAssetLedger,
  SolunaBoincRun,
  SolunaJobsState,
  SolunaNewsBriefing,
  SolunaSystemMessage,
} from "@/lib/types/soluna";

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
    solComment: `アイテム ${itemCount} 個の余熱で、宇宙分析を ${minutes} 分ぶん回すよ。街の開拓パワーになる！`,
    lunaComment: `時間は気分で決めないこと。${minutes} 分、ログを残してから回して。拠点の礎になるわ。`,
  };
}

function withBitFlyerFlag(
  state: Omit<SolunaJobsState, "bitFlyerConfigured">,
): SolunaJobsState {
  return {
    ...state,
    bitFlyerConfigured: isBitFlyerEnabled(),
  };
}

/** 解消済みの Note 公開エラーを台帳から消す（UI に残さない） */
async function sanitizeLatestNote(
  note: Awaited<ReturnType<typeof getLatestNoteArticle>>,
): Promise<typeof note> {
  if (!note?.error) return note;
  const stale =
    note.error.includes("利用できない内容") ||
    (note.published && Boolean(note.noteUrl));
  if (!stale) return note;
  const cleared = { ...note, error: undefined };
  await saveSystemNoteArticle(cleared);
  return cleared;
}

export async function buildJobsState(): Promise<SolunaJobsState> {
  const [latestNoteRaw, latestBoinc, assets, settlement] = await Promise.all([
    getLatestNoteArticle(),
    getLatestBoincRun(),
    getSystemAssets(),
    getSystemSettlement(),
  ]);
  const latestNote = await sanitizeLatestNote(latestNoteRaw);
  return withBitFlyerFlag({
    noteConfigured: isNotePublishConfigured(),
    creatorUrl: noteCreatorUrl(),
    latestNote,
    latestBoinc,
    assets,
    settlement,
  });
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

  // 資産運用を先に実行し、Note の有料パートに財務報告を載せる
  const existingAssets = await getSystemAssets();
  let assets: SolunaAssetLedger;
  try {
    assets = await runDailyAssetTrade({
      ledger: existingAssets,
      hunter,
      newsSummary: briefing.summary ?? "",
      briefingId: briefing.id,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "資産運用エラー";
    console.error("[soluna-jobs] asset trade error:", errMsg);
    assets = existingAssets ?? {
      principalYen: 100_000,
      lastMonthTotalYen: 100_000,
      monthlyTargetYen: 2_000,
      monthlyRealizedPnlYen: 0,
      sleepMode: false,
      btcHeld: 0,
      ethHeld: 0,
      xrpHeld: 0,
      xlmHeld: 0,
      zpgHeld: 0,
      cashYen: 100_000,
      totalYen: 100_000,
      previousTotalYen: 100_000,
      previousBtcValueYen: 0,
      previousCashYen: 100_000,
      btcPriceYen: 0,
      ethPriceYen: 0,
      xrpPriceYen: 0,
      xlmPriceYen: 0,
      zpgPriceYen: 0,
      battleMode: "defense" as const,
      trades: [],
      monthlySummaries: [],
      medalUnits: medalUnitScore(hunter.medals),
      status: "waiting-spec" as const,
      solComment: `エラーが発生した: ${errMsg}`,
      lunaComment: "API キーか残高を確認して。",
      updatedAt: new Date().toISOString(),
    };
  }

  // BOINC 分数で拠点都市を進める（同日の再実行で二重加算しない）
  const prevSettlement = await getSystemSettlement();
  const settlement =
    prevSettlement?.latestEvent?.briefingId === briefing.id
      ? prevSettlement
      : advanceSettlement(prevSettlement, boinc.minutes, briefing.id);

  const composed = composeDailyNote({
    briefing,
    battle,
    hunter,
    messages,
    boincMinutes: boinc.minutes,
    assets,
    boinc,
    settlement,
  });

  let article = createNoteArticleRecord(composed, briefing.id);
  if (isNotePublishConfigured()) {
    try {
      const published = await publishNoteArticle({
        title: composed.title,
        freeHtml: composed.freeHtml,
        paidHtml: composed.paidHtml,
        priceYen: composed.priceYen,
        separator: composed.freeLastBlockId,
        hashtags: composed.hashtags,
        imageKeys: composed.imageKeys,
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

  await saveSystemNoteArticle(article);
  await saveSystemBoincRun(boinc);
  await saveSystemAssets(assets);
  await saveSystemSettlement(settlement);

  return withBitFlyerFlag({
    noteConfigured: isNotePublishConfigured(),
    creatorUrl: noteCreatorUrl(),
    latestNote: article,
    latestBoinc: boinc,
    assets,
    settlement,
  });
}
