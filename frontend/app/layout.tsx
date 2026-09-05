import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Manrope, Zen_Kaku_Gothic_New } from "next/font/google";
import PublicPageTracker from "@/components/analytics/PublicPageTracker";
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
  metadataBase: new URL("https://www.aquacore.net"),
  title: "AQUA — Personal Software Studio",
  description:
    "AQUA 個人向け統合情報ポータル。保有株・ディズニー・AI 合議・宇宙分析・WORKS を一つの画面から。",
  applicationName: "AQUA",
  robots: {
    index: false,
    follow: false,
    noarchive: true,
  },
  openGraph: {
    type: "website",
    locale: "ja_JP",
    siteName: "AQUA Personal Software Studio",
    title: "AQUA — Personal Software Studio",
    description:
      "AI、行政可視化、ディズニー混雑予測、宇宙分析、社会貢献を統合する未来実験スタジオ。",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a1a33",
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
        <PublicPageTracker />
        {children}
      </body>
    </html>
  );
}
