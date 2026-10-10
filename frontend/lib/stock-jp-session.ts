/**
 * 東証現物の時間帯判定（JST）。
 *
 * marketHours = ザラ場そのもの（UI / VM 稼働オラクル用）
 * tradeWindow = 発注してよい粗い窓（寄り直後・大引け前ブラックアウト除外）
 *
 * 過去の失敗: tradeWindow を UI の「市場外」に流用し、後場 14:45 以降を
 * 「待機（市場外）」と誤表示 → sync 2時間枯れを正常扱いにした。
 */
import {
  STOCK_SESSION_CLOSE_BLACKOUT_MIN,
  STOCK_SESSION_OPEN_BLACKOUT_MIN,
} from "@/lib/stock-trade-constants";
import { isJpEquityExchangeHoliday } from "@/lib/stock-jp-holidays";

export type JpSessionClock = {
  weekday: string;
  hour: number;
  minute: number;
  mins: number;
};

/** Intl の hour=24 / hour=0 揺れを吸収して JST の分を返す */
export function jstSessionClock(now = new Date()): JpSessionClock {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  const weekday = get("weekday");
  let hour = Number(get("hour") || "0");
  const minute = Number(get("minute") || "0");
  // en-US + hour12:false で 24:xx になる環境がある
  if (hour === 24) hour = 0;
  return { weekday, hour, minute, mins: hour * 60 + minute };
}

function isWeekday(clock: JpSessionClock): boolean {
  return clock.weekday !== "Sat" && clock.weekday !== "Sun";
}

const OPEN = 9 * 60;
const AM_END = 11 * 60 + 30;
const PM_START = 12 * 60 + 30;
/** 東証後場終了（大引け） */
export const JP_EQUITY_CLOSE_MINS = 15 * 60;

/**
 * ザラ場時間帯か（前場・後場）。ブラックアウトなし。
 * UI「場中／市場外」・VM sync 鮮度オラクルはこれを使う。
 */
export function isJpEquityMarketHours(now = new Date()): boolean {
  const clock = jstSessionClock(now);
  if (!isWeekday(clock)) return false;
  if (isJpEquityExchangeHoliday(now)) return false;
  const { mins } = clock;
  const am = mins >= OPEN && mins < AM_END;
  // 後場は 15:00 ちょうどまで場中（15:00 以降は場外）
  const pm = mins >= PM_START && mins <= JP_EQUITY_CLOSE_MINS;
  return am || pm;
}

/**
 * 発注してよい粗い窓（#30 ブラックアウト込み）。
 * intents / LIVE 発注ゲート用。UI の市場外ラベルには使わない。
 */
export function isJpEquityTradeWindow(now = new Date()): boolean {
  const clock = jstSessionClock(now);
  if (!isWeekday(clock)) return false;
  if (isJpEquityExchangeHoliday(now)) return false;
  const { mins } = clock;
  const openOk =
    mins >= OPEN + STOCK_SESSION_OPEN_BLACKOUT_MIN && mins <= AM_END;
  const pmOk =
    mins >= PM_START &&
    mins <= JP_EQUITY_CLOSE_MINS - STOCK_SESSION_CLOSE_BLACKOUT_MIN;
  return openOk || pmOk;
}

/** @deprecated 名前が曖昧。tradeWindow と同義。新規は isJpEquityTradeWindow */
export function isRoughJpEquitySession(now = new Date()): boolean {
  return isJpEquityTradeWindow(now);
}
