import ShowcaseShell from "@/components/showcase/ShowcaseShell";
import StudioShowcase from "@/components/showcase/StudioShowcase";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AQUA SHOWCASE — AI・ディズニー・行政・宇宙の未来実験",
  description:
    "AQUA STUDIOのサンキー図、AI合議、ディズニー混雑予測、小惑星3D、Soluna自動社会貢献を認証なしで体験できる公開ショーケース。",
  alternates: { canonical: "/sample" },
  robots: { index: true, follow: true },
  keywords: [
    "AQUA",
    "AI",
    "東京ディズニーリゾート 混雑予測",
    "行政事業レビュー",
    "サンキー図",
    "BOINC 社会貢献",
    "宇宙分析",
  ],
  openGraph: {
    url: "/sample",
    type: "website",
    title: "AQUA SHOWCASE — AIと社会貢献の未来実験",
    description:
      "AI、ディズニー混雑予測、行政可視化、宇宙分析、BOINC社会貢献の公開デモ。",
  },
};

const structuredData = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "AQUA SHOWCASE",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  url: "https://www.aquacore.net/sample",
  description:
    "AI、行政予算可視化、ディズニー混雑予測、宇宙分析、BOINC社会貢献を統合した公開ショーケース。",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "JPY",
  },
};

export default function SamplePage() {
  return (
    <ShowcaseShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <StudioShowcase />
    </ShowcaseShell>
  );
}
