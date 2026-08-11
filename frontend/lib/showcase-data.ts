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
    titleJa: "訴訟記録分析",
    description:
      "訴状・答弁書・準備書面を AI が横断分析。争点・時系列・証拠対応を構造化して、NotebookLM 風に整理します。",
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
  { id: "gov", label: "一般会計", kind: "government", amount: 12800 },
  { id: "cao", label: "内閣府", kind: "ministry", amount: 1400, drillable: true },
  { id: "mhlw", label: "厚労省", kind: "ministry", amount: 2800, drillable: true },
  { id: "mext", label: "文部科学省", kind: "ministry", amount: 2600, drillable: true },
  { id: "mlit", label: "国土交通省", kind: "ministry", amount: 2200, drillable: true },
  { id: "mod", label: "防衛省", kind: "ministry", amount: 1800, drillable: true },
  { id: "meti", label: "経済産業省", kind: "ministry", amount: 3000, drillable: true },
  { id: "med-dx", label: "医療DX推進", kind: "project", amount: 1200, drillable: true },
  { id: "vaccine", label: "ワクチン研究", kind: "project", amount: 900, drillable: true },
  { id: "welfare-sys", label: "福祉システム刷新", kind: "project", amount: 1300, drillable: true },
  { id: "univ-research", label: "大学研究基盤", kind: "project", amount: 1500, drillable: true },
  { id: "school-it", label: "GIGA端末更新", kind: "project", amount: 1300, drillable: true },
  { id: "road-maint", label: "道路維持補修", kind: "project", amount: 1200, drillable: true },
  { id: "disaster", label: "防災インフラ", kind: "project", amount: 1000, drillable: true },
  { id: "defense-rd", label: "防衛技術研究", kind: "project", amount: 1380, drillable: true },
  { id: "mod-civil", label: "防衛施設土木", kind: "project", amount: 420, drillable: true },
  { id: "industry-dx", label: "産業DX助成", kind: "project", amount: 1600, drillable: true },
  { id: "startup", label: "スタートアップ支援", kind: "project", amount: 1000, drillable: true },
  { id: "corp-a", label: "システムIntegrator A", kind: "payee", amount: 680, drillable: true },
  { id: "corp-b", label: "メディカルB社", kind: "payee", amount: 520, drillable: true },
  { id: "univ-x", label: "国立大学X", kind: "payee", amount: 900, drillable: true },
  { id: "corp-c", label: "福祉テックC", kind: "payee", amount: 720, drillable: true },
  { id: "corp-d", label: "SIベンダD", kind: "payee", amount: 580, drillable: true },
  { id: "univ-y", label: "総合大学Y", kind: "payee", amount: 800, drillable: true },
  { id: "lab-z", label: "公的研究機関Z", kind: "payee", amount: 700, drillable: true },
  { id: "corp-e", label: "教育ICT E社", kind: "payee", amount: 1300, drillable: true },
  { id: "corp-f", label: "建設コンサルF", kind: "payee", amount: 880, drillable: true },
  { id: "corp-g", label: "土木G社", kind: "payee", amount: 740, drillable: true },
  { id: "corp-h", label: "防災H社", kind: "payee", amount: 1000, drillable: true },
  { id: "corp-i", label: "防衛関連I社", kind: "payee", amount: 1200, drillable: true },
  { id: "corp-j", label: "研究開発J", kind: "payee", amount: 600, drillable: true },
  { id: "corp-k", label: "製造DX K社", kind: "payee", amount: 1000, drillable: true },
  { id: "corp-l", label: "中小企業L", kind: "payee", amount: 600, drillable: true },
  { id: "corp-m", label: "VC連携M", kind: "payee", amount: 1000, drillable: true },
];

export const SHOWCASE_SANKEY_LINKS: MoneyFlowLink[] = [
  { source: "gov", target: "cao", amount: 1400 },
  { source: "gov", target: "mhlw", amount: 2800 },
  { source: "gov", target: "mext", amount: 2600 },
  { source: "gov", target: "mlit", amount: 2200 },
  { source: "gov", target: "mod", amount: 1800 },
  { source: "gov", target: "meti", amount: 3000 },
  { source: "cao", target: "welfare-sys", amount: 700 },
  { source: "mhlw", target: "welfare-sys", amount: 600 },
  { source: "mhlw", target: "med-dx", amount: 1200 },
  { source: "mhlw", target: "vaccine", amount: 900 },
  { source: "mext", target: "univ-research", amount: 1500 },
  { source: "mext", target: "school-it", amount: 1300 },
  { source: "mlit", target: "road-maint", amount: 1200 },
  { source: "mlit", target: "disaster", amount: 1000 },
  { source: "mod", target: "defense-rd", amount: 1380 },
  { source: "mod", target: "mod-civil", amount: 420 },
  { source: "meti", target: "industry-dx", amount: 1600 },
  { source: "meti", target: "startup", amount: 1000 },
  { source: "med-dx", target: "corp-a", amount: 680 },
  { source: "med-dx", target: "corp-b", amount: 520 },
  { source: "vaccine", target: "univ-x", amount: 900 },
  { source: "welfare-sys", target: "corp-c", amount: 720 },
  { source: "welfare-sys", target: "corp-d", amount: 580 },
  { source: "univ-research", target: "univ-y", amount: 800 },
  { source: "univ-research", target: "lab-z", amount: 700 },
  { source: "school-it", target: "corp-e", amount: 1300 },
  { source: "road-maint", target: "corp-f", amount: 880 },
  { source: "road-maint", target: "corp-g", amount: 320 },
  { source: "mod-civil", target: "corp-g", amount: 420 },
  { source: "disaster", target: "corp-h", amount: 1000 },
  { source: "defense-rd", target: "corp-i", amount: 1200 },
  { source: "defense-rd", target: "corp-j", amount: 600 },
  { source: "industry-dx", target: "corp-k", amount: 1000 },
  { source: "industry-dx", target: "corp-l", amount: 600 },
  { source: "startup", target: "corp-m", amount: 1000 },
];

export type ShowcasePayeeContract = {
  ministry: string;
  project: string;
  amount: number;
  fiscalYear: string;
  note?: string;
};

export type ShowcasePayeeDetail = {
  id: string;
  name: string;
  totalAmount: number;
  summary: string;
  contracts: ShowcasePayeeContract[];
};

export const SHOWCASE_PAYEE_DETAILS: Record<string, ShowcasePayeeDetail> = {
  "corp-g": {
    id: "corp-g",
    name: "土木G社",
    totalAmount: 740,
    summary: "国土交通省の道路維持と防衛省の施設土木の双方から受注。入れ子のサンキーで合流する典型例。",
    contracts: [
      { ministry: "防衛省", project: "防衛施設土木", amount: 420, fiscalYear: "R6", note: "基地内舗装・排水改修" },
      { ministry: "国土交通省", project: "道路維持補修", amount: 320, fiscalYear: "R6", note: "区間補修・舗装更新" },
    ],
  },
  "corp-c": {
    id: "corp-c",
    name: "福祉テックC",
    totalAmount: 720,
    summary: "内閣府と厚労省が共同系統でつなぐ福祉システム刷新事業の主受託先。",
    contracts: [
      { ministry: "内閣府", project: "福祉システム刷新", amount: 390, fiscalYear: "R6", note: "マイナ連携基盤" },
      { ministry: "厚労省", project: "福祉システム刷新", amount: 330, fiscalYear: "R6", note: "介護請求モジュール" },
    ],
  },
  "corp-a": {
    id: "corp-a",
    name: "システムIntegrator A",
    totalAmount: 680,
    summary: "医療DX推進の最大支出先。クラウド基盤とレセプト連携を担当。",
    contracts: [
      { ministry: "厚労省", project: "医療DX推進", amount: 680, fiscalYear: "R6", note: "電子カルテ連携 PoC" },
    ],
  },
  "corp-i": {
    id: "corp-i",
    name: "防衛関連I社",
    totalAmount: 1200,
    summary: "防衛技術研究の中核ベンダー。研究開発J社と分担受注。",
    contracts: [
      { ministry: "防衛省", project: "防衛技術研究", amount: 1200, fiscalYear: "R6", note: "センサー融合研究" },
    ],
  },
  "corp-f": {
    id: "corp-f",
    name: "建設コンサルF",
    totalAmount: 880,
    summary: "国交省道路維持の設計・監理。土木G社とは別系統の大口支出先。",
    contracts: [
      { ministry: "国土交通省", project: "道路維持補修", amount: 880, fiscalYear: "R6", note: "橋梁点検・設計" },
    ],
  },
  "corp-e": {
    id: "corp-e",
    name: "教育ICT E社",
    totalAmount: 1300,
    summary: "GIGA端末更新の単独受託。文部科学省から一括流れ。",
    contracts: [
      { ministry: "文部科学省", project: "GIGA端末更新", amount: 1300, fiscalYear: "R6", note: "端末調達・保守" },
    ],
  },
};

export const SHOWCASE_JUDICIAL_DOCS = [
  { id: "complaint", label: "訴状", tag: "原告", kind: "complaint" as const },
  { id: "answer", label: "答弁書", tag: "被告", kind: "answer" as const },
  { id: "brief", label: "準備書面", tag: "原告", kind: "brief" as const },
  { id: "exhibit-ko", label: "甲第2号証", tag: "証拠", kind: "exhibit" as const },
  { id: "exhibit-otsu", label: "乙第1号証", tag: "証拠", kind: "exhibit" as const },
  { id: "statement", label: "陳述書", tag: "被告", kind: "statement" as const },
];

export type ShowcaseJudicialPhase = "issues" | "timeline" | "evidence";

export const SHOWCASE_JUDICIAL_AI = {
  caseTitle: "架空サンプル — 建物明渡・賃料請求事件",
  provider: "Gemini",
  phases: [
    {
      id: "issues" as const,
      label: "争点整理",
      prompt: "争点を整理してください。",
      thinking: ["訴状・答弁書の請求原因を照合", "修繕義務と相殺の主張を分離", "立証責任の配分を整理"],
      summary: "AI が4資料から争点を3層に整理しました",
      items: [
        {
          title: "争点① 修繕義務の有無",
          body: "原告は賃貸借契約第5条に基づく修繕請求権を主張。被告は「小修繕の範囲外」と反論。",
          refs: ["訴状", "答弁書", "準備書面"],
          stance: "核心争点",
        },
        {
          title: "争点② 損害相殺の範囲",
          body: "被告は漏水による生活妨害を理由に賃料相当損害の相殺を主張。原告は因果関係と額を争う。",
          refs: ["答弁書", "乙第1号証"],
          stance: "被告主張",
        },
        {
          title: "争点③ 明渡し時期",
          body: "建物明渡請求に対し、被告は修繕完了までの猶予を求めている。",
          refs: ["訴状", "陳述書"],
          stance: "手続争点",
        },
      ],
    },
    {
      id: "timeline" as const,
      label: "時系列",
      prompt: "事実関係を時系列でまとめてください。",
      thinking: ["契約締結日を起点にイベント抽出", "催告・修繕請求の順序を確認", "損害発生時期を突合"],
      summary: "主要事実を7点のタイムラインに再構成",
      items: [
        { date: "2022-04", event: "賃貸借契約締結（2年定期）", refs: ["甲第1号証"] },
        { date: "2024-01", event: "天井からの漏水を被告が発見・通知", refs: ["乙第1号証"] },
        { date: "2024-02", event: "原告へ修繕請求（内容証明）", refs: ["甲第2号証"] },
        { date: "2024-03", event: "原告側「応じる旨」の返信（争点あり）", refs: ["準備書面"] },
        { date: "2024-06", event: "賃料支払停止（被告）", refs: ["答弁書"] },
        { date: "2024-09", event: "契約満了・明渡し催告", refs: ["訴状"] },
        { date: "2024-11", event: "本訴提起", refs: ["訴状"] },
      ],
    },
    {
      id: "evidence" as const,
      label: "証拠対応",
      prompt: "甲号証と乙号証の対応関係を整理してください。",
      thinking: ["甲号証の立証趣旨を分類", "乙号証による反証ポイントを抽出", "未提出・要確認をフラグ"],
      summary: "証拠8点を争点マトリクスにマッピング",
      items: [
        {
          exhibit: "甲第1号証",
          claim: "契約関係・修繕条項の存在",
          counter: "—",
          status: "認容見込",
        },
        {
          exhibit: "甲第2号証",
          claim: "修繕催告の実施",
          counter: "乙第1号証（損害の程度）",
          status: "争いあり",
        },
        {
          exhibit: "乙第1号証",
          claim: "—",
          counter: "漏水規模・生活妨害の具体化",
          status: "反証資料",
        },
        {
          exhibit: "準備書面",
          claim: "催告後の対応経緯",
          counter: "相殺範囲の限定",
          status: "補強必要",
        },
      ],
    },
  ],
};

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
