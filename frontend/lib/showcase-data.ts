import type { MoneyFlowLink, MoneyFlowNode } from "@/lib/types/gyosei";

export type ShowcaseSectionMeta = {
  id: string;
  index: string;
  title: string;
  titleJa: string;
  description: string;
  accent: string;
  href: string;
  tag: string;
};

export const SHOWCASE_SECTIONS: ShowcaseSectionMeta[] = [
  {
    id: "sankey",
    index: "01",
    title: "Money Flow",
    titleJa: "サンキーダイアグラム",
    description:
      "行政事業レビューの予算データをサンキー図で可視化。省庁→事業→支出先をドリルダウンし、お金の流れを直感的に追えます。",
    accent: "#67e8f9",
    href: "/works/admin/money-flow",
    tag: "WORKS",
  },
  {
    id: "judicial",
    index: "02",
    title: "Case Notebook",
    titleJa: "訴訟記録",
    description:
      "訴状・答弁書・準備書面を NotebookLM 風に整理。争点・時系列・証拠対応を AI が支援する司法学習ツールです。",
    accent: "#c4b5fd",
    href: "/works/judicial/case-notebook",
    tag: "WORKS",
  },
  {
    id: "council",
    index: "03",
    title: "AI Council",
    titleJa: "AI 合同会議",
    description:
      "論理派・発想派・懐疑派が議論し、議長が統合結論を出す。国内限定と最新モデルの2モードで多角的な判断を得られます。",
    accent: "#a78bfa",
    href: "/council",
    tag: "Multi-AI",
  },
  {
    id: "stocks",
    index: "04",
    title: "Stock Watch",
    titleJa: "保有株",
    description:
      "米国株・日本株をウォッチリストで管理。価格変動と AI 売買アドバイスで、保有銘柄の動きを逃しません。",
    accent: "#38bdf8",
    href: "/stocks",
    tag: "Finance",
  },
  {
    id: "disney",
    index: "05",
    title: "TDR Analytics",
    titleJa: "ディズニー",
    description:
      "TDR の混雑予測・待ち時間・キャラクターチャット。パーク体験をデータと AI で計画するモジュールです。",
    accent: "#f0abfc",
    href: "/disney",
    tag: "Experience",
  },
  {
    id: "asteroid",
    index: "06",
    title: "NEO Simulator",
    titleJa: "小惑星 3D シミュレーター",
    description:
      "JPL 接近データを 3D 軌道で再現。地球への最接近距離とリスクを、インタラクティブに確認できます。",
    accent: "#818cf8",
    href: "/space",
    tag: "Cosmos",
  },
];

export const SHOWCASE_SANKEY_NODES: MoneyFlowNode[] = [
  { id: "gov", label: "一般会計", kind: "government", amount: 4200 },
  { id: "mhlw", label: "厚労省", kind: "ministry", amount: 980, drillable: true },
  { id: "mext", label: "文部科学省", kind: "ministry", amount: 760, drillable: true },
  { id: "dx", label: "医療DX推進", kind: "project", amount: 520, drillable: true },
  { id: "research", label: "研究開発", kind: "project", amount: 410, drillable: true },
  { id: "corp-a", label: "受託A社", kind: "payee", amount: 380 },
  { id: "corp-b", label: "受託B社", kind: "payee", amount: 290 },
];

export const SHOWCASE_SANKEY_LINKS: MoneyFlowLink[] = [
  { source: "gov", target: "mhlw", amount: 980 },
  { source: "gov", target: "mext", amount: 760 },
  { source: "mhlw", target: "dx", amount: 520 },
  { source: "mext", target: "research", amount: 410 },
  { source: "dx", target: "corp-a", amount: 380 },
  { source: "research", target: "corp-b", amount: 290 },
];

export const SHOWCASE_JUDICIAL_DOCS = [
  { id: "complaint", label: "訴状", tag: "原告", excerpt: "建物明渡・未払賃料 1,200万円の請求" },
  { id: "answer", label: "答弁書", tag: "被告", excerpt: "修繕義務不履行による損害の相殺を主張" },
  { id: "brief", label: "準備書面", tag: "原告", excerpt: "契約上の修繕請求権と催告の効力を整理" },
  { id: "exhibit", label: "甲第2号証", tag: "証拠", excerpt: "内容証明郵便 — 修繕催告の記録" },
];

export const SHOWCASE_COUNCIL_LINES = [
  { role: "logic" as const, label: "論理派", text: "事実関係を整理すると、修繕義務の有無が争点の核心です。" },
  { role: "creative" as const, label: "発想派", text: "和解案として段階的明渡し＋賃料減額も選択肢になります。" },
  { role: "skeptic" as const, label: "懐疑派", text: "相殺の範囲に上限がある点、原告側の反論余地は残ります。" },
  { role: "judge" as const, label: "議長", text: "争点は修繕義務と相殺。まず証拠説明書で立証計画を固めましょう。" },
];

export const SHOWCASE_STOCKS = [
  { symbol: "NVDA", name: "NVIDIA", market: "NASDAQ", price: 892.4, change: 2.8 },
  { symbol: "7203", name: "トヨタ", market: "TSE", price: 3420, change: -0.6 },
  { symbol: "AAPL", name: "Apple", market: "NASDAQ", price: 198.2, change: 1.1 },
];

export const SHOWCASE_DISNEY_ATTRACTIONS = [
  { name: "スペース・マウンテン", wait: 75, park: "TDL" },
  { name: "美女と野獣", wait: 55, park: "TDL" },
  { name: "ソarin", wait: 40, park: "TDS" },
  { name: "タワー・オブ・テラー", wait: 90, park: "TDS" },
];
