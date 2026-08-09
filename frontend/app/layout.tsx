import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Manrope, Zen_Kaku_Gothic_New } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// 見出し用。Space Grotesk の角張った印象をやめ、細字が綺麗に出る書体にする。
const manrope = Manrope({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

// 和文が明朝寄りの OS フォント任せだと硬く見えるので、丸みのあるゴシックを当てる。
const zenKaku = Zen_Kaku_Gothic_New({
  variable: "--font-jp",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "AQUA — Personal Software Studio",
  description:
    "AQUA 個人向け統合情報ポータル。保有株・ディズニー・AI 合議・宇宙分析・WORKS を一つの画面から。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#030b1a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable} ${manrope.variable} ${zenKaku.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col overflow-x-hidden text-slate-100">
        {children}
      </body>
    </html>
  );
}
