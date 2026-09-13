/**
 * クラウド構成の想定月額費用（JPY・概算）。
 * 本番見積ではなく、提案資料向けのオーダー感用。
 * リージョン想定: Japan East / Asia Pacific (Tokyo)
 * 前提: 小〜中規模 PoC〜初期本番（24/7、低〜中トラフィック）
 */

export type DocsCloudProvider = "azure" | "aws";

export type DocsCloudCostHint = {
  /** 月額想定の中央値（円） */
  monthlyJpy: number;
  /** レンジ表示用（任意） */
  monthlyJpyMin?: number;
  monthlyJpyMax?: number;
  /** 前提の短い説明 */
  skuNote: string;
};

/** Azure サービスキー → 想定費用 */
export const AZURE_COST_HINTS: Record<string, DocsCloudCostHint> = {
  "app-service": {
    monthlyJpy: 18000,
    monthlyJpyMin: 8000,
    monthlyJpyMax: 45000,
    skuNote: "B2/S1 相当・1〜2 インスタンス",
  },
  "function-apps": {
    monthlyJpy: 4000,
    monthlyJpyMin: 1000,
    monthlyJpyMax: 15000,
    skuNote: "従量＋軽量 Premium 想定",
  },
  "static-web-apps": {
    monthlyJpy: 2500,
    monthlyJpyMin: 0,
    monthlyJpyMax: 9000,
    skuNote: "Standard 相当",
  },
  "api-management": {
    monthlyJpy: 55000,
    monthlyJpyMin: 35000,
    monthlyJpyMax: 120000,
    skuNote: "Developer/Basic 相当",
  },
  "front-door": {
    monthlyJpy: 22000,
    monthlyJpyMin: 12000,
    monthlyJpyMax: 50000,
    skuNote: "Standard＋転送量控え目",
  },
  "app-gateway": {
    monthlyJpy: 28000,
    monthlyJpyMin: 15000,
    monthlyJpyMax: 60000,
    skuNote: "WAF_v2 小規模",
  },
  "load-balancer": {
    monthlyJpy: 6000,
    monthlyJpyMin: 3000,
    monthlyJpyMax: 15000,
    skuNote: "Standard LB",
  },
  "cosmos-db": {
    monthlyJpy: 32000,
    monthlyJpyMin: 15000,
    monthlyJpyMax: 90000,
    skuNote: "400〜1000 RU/s 想定",
  },
  "sql-database": {
    monthlyJpy: 25000,
    monthlyJpyMin: 10000,
    monthlyJpyMax: 70000,
    skuNote: "GP Serverless / S2 相当",
  },
  postgres: {
    monthlyJpy: 22000,
    monthlyJpyMin: 9000,
    monthlyJpyMax: 55000,
    skuNote: "Flexible Server Burstable",
  },
  storage: {
    monthlyJpy: 3000,
    monthlyJpyMin: 500,
    monthlyJpyMax: 12000,
    skuNote: "Blob Hot 数百 GB 未満",
  },
  "key-vault": {
    monthlyJpy: 1500,
    monthlyJpyMin: 500,
    monthlyJpyMax: 5000,
    skuNote: "Standard・操作少なめ",
  },
  "entra-id": {
    monthlyJpy: 8000,
    monthlyJpyMin: 0,
    monthlyJpyMax: 30000,
    skuNote: "P1 ライセンス分の概算",
  },
  users: {
    monthlyJpy: 0,
    skuNote: "アイコンのみ（課金なし）",
  },
  openai: {
    monthlyJpy: 45000,
    monthlyJpyMin: 10000,
    monthlyJpyMax: 150000,
    skuNote: "GPT 系・中程度の呼び出し",
  },
  "cognitive-services": {
    monthlyJpy: 12000,
    monthlyJpyMin: 3000,
    monthlyJpyMax: 40000,
    skuNote: "AI Services 従量",
  },
  "ai-studio": {
    monthlyJpy: 15000,
    monthlyJpyMin: 5000,
    monthlyJpyMax: 50000,
    skuNote: "プロジェクト基盤＋推論控え目",
  },
  aks: {
    monthlyJpy: 55000,
    monthlyJpyMin: 25000,
    monthlyJpyMax: 150000,
    skuNote: "制御面＋小ノードプール",
  },
  "container-apps": {
    monthlyJpy: 12000,
    monthlyJpyMin: 4000,
    monthlyJpyMax: 40000,
    skuNote: "消費プラン中規模",
  },
  "container-instances": {
    monthlyJpy: 8000,
    monthlyJpyMin: 2000,
    monthlyJpyMax: 25000,
    skuNote: "常時1〜2コンテナ",
  },
  "container-registry": {
    monthlyJpy: 5000,
    monthlyJpyMin: 2000,
    monthlyJpyMax: 15000,
    skuNote: "Basic/Standard",
  },
  vm: {
    monthlyJpy: 20000,
    monthlyJpyMin: 8000,
    monthlyJpyMax: 60000,
    skuNote: "B2ms / D2s_v5 相当×1",
  },
  vnet: {
    monthlyJpy: 2000,
    monthlyJpyMin: 0,
    monthlyJpyMax: 8000,
    skuNote: "ピアリング・出口控え目",
  },
  nsg: {
    monthlyJpy: 0,
    skuNote: "ルール課金なし（運用コストのみ）",
  },
  subnet: {
    monthlyJpy: 0,
    skuNote: "VNet 内セグメント（課金なし）",
  },
  "private-endpoint": {
    monthlyJpy: 4500,
    monthlyJpyMin: 2000,
    monthlyJpyMax: 12000,
    skuNote: "PE 数個＋データ処理控え目",
  },
  "private-link": {
    monthlyJpy: 4000,
    monthlyJpyMin: 1500,
    monthlyJpyMax: 10000,
    skuNote: "Private Link サービス控え目",
  },
  bastion: {
    monthlyJpy: 28000,
    monthlyJpyMin: 18000,
    monthlyJpyMax: 50000,
    skuNote: "Basic/Standard 1 ホスト",
  },
  "nat-gateway": {
    monthlyJpy: 12000,
    monthlyJpyMin: 6000,
    monthlyJpyMax: 30000,
    skuNote: "Gateway＋出口転送控え目",
  },
  "public-ip": {
    monthlyJpy: 1500,
    monthlyJpyMin: 500,
    monthlyJpyMax: 5000,
    skuNote: "Standard PIP 1〜2",
  },
  "route-table": {
    monthlyJpy: 0,
    skuNote: "UDR（課金なし）",
  },
  "vpn-gateway": {
    monthlyJpy: 35000,
    monthlyJpyMin: 20000,
    monthlyJpyMax: 80000,
    skuNote: "VpnGw1 相当",
  },
  expressroute: {
    monthlyJpy: 80000,
    monthlyJpyMin: 40000,
    monthlyJpyMax: 200000,
    skuNote: "小帯域サーキット概算",
  },
  "dns-zone": {
    monthlyJpy: 1500,
    monthlyJpyMin: 500,
    monthlyJpyMax: 5000,
    skuNote: "Private DNS Zone＋クエリ",
  },
  firewall: {
    monthlyJpy: 90000,
    monthlyJpyMin: 60000,
    monthlyJpyMax: 180000,
    skuNote: "Azure Firewall Standard",
  },
  monitor: {
    monthlyJpy: 6000,
    monthlyJpyMin: 2000,
    monthlyJpyMax: 25000,
    skuNote: "メトリクス＋ログ取り込み控えめ",
  },
  "app-insights": {
    monthlyJpy: 5000,
    monthlyJpyMin: 1500,
    monthlyJpyMax: 20000,
    skuNote: "取り込み 数 GB/月",
  },
  "log-analytics": {
    monthlyJpy: 7000,
    monthlyJpyMin: 2000,
    monthlyJpyMax: 30000,
    skuNote: "ワークスペース取り込み控えめ",
  },
  "event-hubs": {
    monthlyJpy: 9000,
    monthlyJpyMin: 3000,
    monthlyJpyMax: 30000,
    skuNote: "Basic/Standard 1 TU",
  },
  "service-bus": {
    monthlyJpy: 8000,
    monthlyJpyMin: 2500,
    monthlyJpyMax: 25000,
    skuNote: "Standard 名前空間",
  },
  "logic-apps": {
    monthlyJpy: 5000,
    monthlyJpyMin: 1000,
    monthlyJpyMax: 20000,
    skuNote: "従量実行",
  },
  "data-factory": {
    monthlyJpy: 10000,
    monthlyJpyMin: 3000,
    monthlyJpyMax: 40000,
    skuNote: "パイプライン実行控えめ",
  },
  redis: {
    monthlyJpy: 18000,
    monthlyJpyMin: 8000,
    monthlyJpyMax: 45000,
    skuNote: "Basic/C1 相当",
  },
  search: {
    monthlyJpy: 28000,
    monthlyJpyMin: 12000,
    monthlyJpyMax: 70000,
    skuNote: "Basic/Standard S1",
  },
  cdn: {
    monthlyJpy: 4000,
    monthlyJpyMin: 1000,
    monthlyJpyMax: 15000,
    skuNote: "転送量控えめ",
  },
  "resource-group": { monthlyJpy: 0, skuNote: "課金なし" },
  subscription: { monthlyJpy: 0, skuNote: "課金なし" },
};

/** AWS サービスキー → 想定費用 */
export const AWS_COST_HINTS: Record<string, DocsCloudCostHint> = {
  "api-gateway": {
    monthlyJpy: 5000,
    monthlyJpyMin: 1000,
    monthlyJpyMax: 20000,
    skuNote: "REST/HTTP API・呼び出し控えめ",
  },
  cloudfront: {
    monthlyJpy: 6000,
    monthlyJpyMin: 1500,
    monthlyJpyMax: 25000,
    skuNote: "配信量控えめ",
  },
  alb: {
    monthlyJpy: 12000,
    monthlyJpyMin: 6000,
    monthlyJpyMax: 30000,
    skuNote: "ALB＋LCU 控えめ",
  },
  lambda: {
    monthlyJpy: 4000,
    monthlyJpyMin: 500,
    monthlyJpyMax: 20000,
    skuNote: "従量・中程度の呼び出し",
  },
  "ecs-fargate": {
    monthlyJpy: 22000,
    monthlyJpyMin: 8000,
    monthlyJpyMax: 70000,
    skuNote: "0.5–1 vCPU×常時1〜2",
  },
  eks: {
    monthlyJpy: 65000,
    monthlyJpyMin: 35000,
    monthlyJpyMax: 180000,
    skuNote: "制御面＋小ノード",
  },
  ec2: {
    monthlyJpy: 18000,
    monthlyJpyMin: 7000,
    monthlyJpyMax: 55000,
    skuNote: "t3.medium 相当×1",
  },
  "elastic-beanstalk": {
    monthlyJpy: 20000,
    monthlyJpyMin: 8000,
    monthlyJpyMax: 60000,
    skuNote: "小規模 Web 環境",
  },
  amplify: {
    monthlyJpy: 3000,
    monthlyJpyMin: 0,
    monthlyJpyMax: 12000,
    skuNote: "Hosting＋ビルド控えめ",
  },
  s3: {
    monthlyJpy: 2500,
    monthlyJpyMin: 300,
    monthlyJpyMax: 10000,
    skuNote: "Standard 数百 GB 未満",
  },
  rds: {
    monthlyJpy: 28000,
    monthlyJpyMin: 12000,
    monthlyJpyMax: 80000,
    skuNote: "db.t3.medium / Single-AZ",
  },
  dynamodb: {
    monthlyJpy: 12000,
    monthlyJpyMin: 2000,
    monthlyJpyMax: 50000,
    skuNote: "オンデマンド・中程度",
  },
  aurora: {
    monthlyJpy: 45000,
    monthlyJpyMin: 20000,
    monthlyJpyMax: 120000,
    skuNote: "Serverless v2 小さめ",
  },
  elasticache: {
    monthlyJpy: 20000,
    monthlyJpyMin: 9000,
    monthlyJpyMax: 55000,
    skuNote: "cache.t3.micro/small",
  },
  "cognito": {
    monthlyJpy: 3000,
    monthlyJpyMin: 0,
    monthlyJpyMax: 15000,
    skuNote: "MAU 少なめ",
  },
  "secrets-manager": {
    monthlyJpy: 2000,
    monthlyJpyMin: 500,
    monthlyJpyMax: 8000,
    skuNote: "秘密情報 数個",
  },
  "kms": {
    monthlyJpy: 1500,
    monthlyJpyMin: 500,
    monthlyJpyMax: 6000,
    skuNote: "CMK＋API 控えめ",
  },
  "bedrock": {
    monthlyJpy: 40000,
    monthlyJpyMin: 8000,
    monthlyJpyMax: 150000,
    skuNote: "生成AI・中程度のトークン",
  },
  "opensearch": {
    monthlyJpy: 35000,
    monthlyJpyMin: 15000,
    monthlyJpyMax: 90000,
    skuNote: "小ドメイン",
  },
  sqs: {
    monthlyJpy: 2000,
    monthlyJpyMin: 200,
    monthlyJpyMax: 10000,
    skuNote: "標準キュー",
  },
  sns: {
    monthlyJpy: 1500,
    monthlyJpyMin: 200,
    monthlyJpyMax: 8000,
    skuNote: "通知控えめ",
  },
  "eventbridge": {
    monthlyJpy: 2000,
    monthlyJpyMin: 300,
    monthlyJpyMax: 10000,
    skuNote: "イベント控えめ",
  },
  "step-functions": {
    monthlyJpy: 3000,
    monthlyJpyMin: 500,
    monthlyJpyMax: 15000,
    skuNote: "実行回数控えめ",
  },
  "cloudwatch": {
    monthlyJpy: 6000,
    monthlyJpyMin: 1500,
    monthlyJpyMax: 25000,
    skuNote: "ログ＋メトリクス控えめ",
  },
  "waf": {
    monthlyJpy: 8000,
    monthlyJpyMin: 3000,
    monthlyJpyMax: 25000,
    skuNote: "WebACL＋ルール基本",
  },
  "route53": {
    monthlyJpy: 1500,
    monthlyJpyMin: 500,
    monthlyJpyMax: 5000,
    skuNote: "ホストゾーン＋クエリ",
  },
  vpc: {
    monthlyJpy: 1500,
    monthlyJpyMin: 0,
    monthlyJpyMax: 6000,
    skuNote: "VPC 本体・フローログ控え目",
  },
  "nat-gateway": {
    monthlyJpy: 18000,
    monthlyJpyMin: 9000,
    monthlyJpyMax: 45000,
    skuNote: "NAT GW 1AZ＋転送控え目",
  },
  "internet-gateway": {
    monthlyJpy: 0,
    skuNote: "IGW（課金なし）",
  },
  nacl: {
    monthlyJpy: 0,
    skuNote: "NACL（課金なし）",
  },
  "security-group": {
    monthlyJpy: 0,
    skuNote: "SG（課金なし）",
  },
  "vpc-endpoint": {
    monthlyJpy: 5000,
    monthlyJpyMin: 2000,
    monthlyJpyMax: 15000,
    skuNote: "Interface EP 数個",
  },
  privatelink: {
    monthlyJpy: 5000,
    monthlyJpyMin: 2000,
    monthlyJpyMax: 15000,
    skuNote: "PrivateLink エンドポイント",
  },
  "transit-gateway": {
    monthlyJpy: 45000,
    monthlyJpyMin: 25000,
    monthlyJpyMax: 100000,
    skuNote: "TGW＋アタッチメント少",
  },
  "site-to-site-vpn": {
    monthlyJpy: 25000,
    monthlyJpyMin: 12000,
    monthlyJpyMax: 60000,
    skuNote: "VPN Connection 1本",
  },
  "direct-connect": {
    monthlyJpy: 70000,
    monthlyJpyMin: 35000,
    monthlyJpyMax: 180000,
    skuNote: "小帯域ポート概算",
  },
  "network-firewall": {
    monthlyJpy: 55000,
    monthlyJpyMin: 30000,
    monthlyJpyMax: 120000,
    skuNote: "Firewall＋エンドポイント",
  },
  "elastic-ip": {
    monthlyJpy: 1200,
    monthlyJpyMin: 0,
    monthlyJpyMax: 4000,
    skuNote: "関連付け済み EIP",
  },
  "ecr": {
    monthlyJpy: 2000,
    monthlyJpyMin: 500,
    monthlyJpyMax: 8000,
    skuNote: "イメージ保管控えめ",
  },
  users: {
    monthlyJpy: 0,
    skuNote: "アイコンのみ（課金なし）",
  },
};

export function formatYen(value: number): string {
  if (value <= 0) return "¥0";
  return `¥${Math.round(value).toLocaleString("ja-JP")}`;
}

export function estimateNodeMonthlyJpy(
  provider: DocsCloudProvider,
  service: string,
  override?: number,
): number {
  if (typeof override === "number" && Number.isFinite(override) && override >= 0) {
    return Math.round(override);
  }
  const table = provider === "aws" ? AWS_COST_HINTS : AZURE_COST_HINTS;
  return table[service]?.monthlyJpy ?? 5000;
}

export function costHintFor(
  provider: DocsCloudProvider,
  service: string,
): DocsCloudCostHint | undefined {
  const table = provider === "aws" ? AWS_COST_HINTS : AZURE_COST_HINTS;
  return table[service];
}

export function sumMonthlyJpy(amounts: number[]): number {
  return amounts.reduce((a, b) => a + b, 0);
}
