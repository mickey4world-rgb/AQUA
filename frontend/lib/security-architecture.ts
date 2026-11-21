/**
 * 防御状況画面の「いまの構成」説明（固定の物語。実装プロキシではなく素人向け層）。
 */
export type SecurityArchitectureLayer = {
  id: string;
  title: string;
  role: string;
  defenses: string[];
};

export const SECURITY_ARCHITECTURE_LAYERS: SecurityArchitectureLayer[] = [
  {
    id: "edge",
    title: "① 入口（Azure SWA・TLS）",
    role: "インターネットからの通信を受け、証明書と配信を担う層",
    defenses: [
      "HTTPS 終端・静的配信",
      "アプリ到達前の基盤側遮断（DDoS 等）はここに含まれる（アプリ記録には出ない）",
    ],
  },
  {
    id: "auth",
    title: "② 認証・許可",
    role: "誰が入れるかを決める層",
    defenses: ["SWA Easy Auth", "許可リスト外のログイン拒否", "自動タスクは専用秘密情報のみ"],
  },
  {
    id: "app",
    title: "③ アプリ API",
    role: "業務機能（株・Soluna・News 等）を動かす層",
    defenses: [
      "レート制限",
      "不正入力の拒否",
      "繰り返し攻撃の自動ブロック（全 API）",
      "遮断内容を SecurityEvents に記録",
    ],
  },
  {
    id: "supply",
    title: "④ 供給チェーン・ホスト",
    role: "依存パッケージと Node 版を健全に保つ層",
    defenses: [
      "Dependabot + 自動検証マージ",
      "SWA 上限に合わせた Node メジャー揃え",
      "毎朝の脆弱性・CodeQL 診断",
    ],
  },
];
