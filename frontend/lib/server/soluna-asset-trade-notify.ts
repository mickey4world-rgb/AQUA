import { sendNotifyEmail } from "@/lib/server/notify-email";
import { resolveSystemNotifyEmails } from "@/lib/server/notify-recipients";
import type { SolunaTradeRecord } from "@/lib/types/soluna";

const PRODUCT_LABEL: Record<string, string> = {
  BTC_JPY: "BTC",
  ETH_JPY: "ETH",
  XRP_JPY: "XRP",
  XLM_JPY: "XLM",
};

function formatYen(value: number): string {
  return `${Math.round(value).toLocaleString("ja-JP")} 円`;
}

export async function notifyAssetTradeExecuted(input: {
  trade: SolunaTradeRecord;
  solComment?: string;
  lunaComment?: string;
  totalYen?: number;
  monthlyRealizedPnlYen?: number;
}): Promise<void> {
  const recipients = await resolveSystemNotifyEmails();
  if (recipients.length === 0) {
    console.warn("[asset-trade-notify] no notifyEmail recipient");
    return;
  }

  const sideJa = input.trade.side === "BUY" ? "買い" : "売り";
  const product = PRODUCT_LABEL[input.trade.product] ?? input.trade.product;
  const price = Math.round(input.trade.priceBtc).toLocaleString("ja-JP");
  const pnlLine =
    input.trade.side === "SELL" && typeof input.trade.realizedPnlJpy === "number"
      ? `実現損益: ${formatYen(input.trade.realizedPnlJpy)}\n`
      : "";

  const subject = `[AQUA Soluna] ${sideJa}約定 ${product} ${formatYen(input.trade.sizeJpy)}`;
  const text = [
    `Soluna 資産の自動売買が実行されました。`,
    ``,
    `区分: ${sideJa}`,
    `銘柄: ${product} (${input.trade.product})`,
    `金額: ${formatYen(input.trade.sizeJpy)}`,
    `単価: ${price} 円`,
    pnlLine.trimEnd(),
    `理由: ${input.trade.reason}`,
    `時刻: ${input.trade.createdAt}`,
    typeof input.totalYen === "number" ? `総資産: ${formatYen(input.totalYen)}` : "",
    typeof input.monthlyRealizedPnlYen === "number"
      ? `当月実現損益: ${formatYen(input.monthlyRealizedPnlYen)}`
      : "",
    input.solComment ? `ソル: ${input.solComment}` : "",
    input.lunaComment ? `ルーナ: ${input.lunaComment}` : "",
    ``,
    `設定の通知先メール（notifyEmail）宛です。`,
  ]
    .filter((line) => line !== "")
    .join("\n");

  const result = await sendNotifyEmail({
    to: recipients,
    subject,
    text,
    category: "asset-trade",
  });
  if (!result.ok) {
    console.warn("[asset-trade-notify] email not sent:", result.reason);
  }
}
