import os
import smtplib
from email.mime.text import MIMEText

import yfinance as yf

TICKER = "TSLA"
BUY_PRICE = 395.0
TARGET_MULTIPLIER = 1.3
TARGET_PRICE = BUY_PRICE * TARGET_MULTIPLIER

GMAIL_ADDRESS = os.environ["GMAIL_ADDRESS"]
GMAIL_APP_PASSWORD = os.environ["GMAIL_APP_PASSWORD"]
NOTIFY_TO = os.environ.get("NOTIFY_TO", GMAIL_ADDRESS)


def send_email(subject: str, body: str) -> None:
    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = GMAIL_ADDRESS
    msg["To"] = NOTIFY_TO

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
        server.login(GMAIL_ADDRESS, GMAIL_APP_PASSWORD)
        server.send_message(msg)


def main() -> None:
    ticker = yf.Ticker(TICKER)
    history = ticker.history(period="3mo")

    history["MA5"] = history["Close"].rolling(window=5).mean()
    history["MA25"] = history["Close"].rolling(window=25).mean()

    latest = history.iloc[-1]
    previous = history.iloc[-2]

    current_price = latest["Close"]
    previous_close = previous["Close"]
    change = current_price - previous_close
    change_pct = change / previous_close * 100

    trend = "上昇トレンド（短期線が長期線の上）" if latest["MA5"] > latest["MA25"] else "下降トレンド（短期線が長期線の下）"

    print(f"=== {TICKER} 自動分析結果 ===")
    print(f"最新株価     : {current_price:.2f} USD")
    print(f"前日比       : {change:+.2f} USD ({change_pct:+.2f}%)")
    print(f"5日移動平均  : {latest['MA5']:.2f} USD")
    print(f"25日移動平均 : {latest['MA25']:.2f} USD")
    print(f"トレンド判定 : {trend}")
    print(f"購入価格     : {BUY_PRICE:.2f} USD")
    print(f"目標株価     : {TARGET_PRICE:.2f} USD (購入価格の{TARGET_MULTIPLIER}倍)")

    if current_price >= TARGET_PRICE:
        subject = f"[株価通知] {TICKER} が目標株価に到達しました"
        body = (
            f"{TICKER} の株価が目標の {TARGET_PRICE:.2f} USD "
            f"(購入価格 {BUY_PRICE:.2f} USD の {TARGET_MULTIPLIER} 倍) に到達しました。\n"
            f"現在価格: {current_price:.2f} USD\n"
        )
        send_email(subject, body)
        print("★ Gmail通知を送信しました。")
    else:
        diff_pct = (TARGET_PRICE - current_price) / current_price * 100
        print(f"まだ目標株価に到達していません（あと{diff_pct:.2f}%）。")


if __name__ == "__main__":
    main()
