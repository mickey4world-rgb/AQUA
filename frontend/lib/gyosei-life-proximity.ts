/**
 * 生活接点マップ「あなたの税金の近さ」—
 * 都道府県（＋任意の市区町村）から、住所・自治体名で結びつく支出先／事業を探す。
 * 緯度経度ジオコードは使わず、公開 CSV の住所文字列と支出先名だけを根拠にする。
 */

export const JAPAN_PREFECTURES = [
  "北海道",
  "青森県",
  "岩手県",
  "宮城県",
  "秋田県",
  "山形県",
  "福島県",
  "茨城県",
  "栃木県",
  "群馬県",
  "埼玉県",
  "千葉県",
  "東京都",
  "神奈川県",
  "新潟県",
  "富山県",
  "石川県",
  "福井県",
  "山梨県",
  "長野県",
  "岐阜県",
  "静岡県",
  "愛知県",
  "三重県",
  "滋賀県",
  "京都府",
  "大阪府",
  "兵庫県",
  "奈良県",
  "和歌山県",
  "鳥取県",
  "島根県",
  "岡山県",
  "広島県",
  "山口県",
  "徳島県",
  "香川県",
  "愛媛県",
  "高知県",
  "福岡県",
  "佐賀県",
  "長崎県",
  "熊本県",
  "大分県",
  "宮崎県",
  "鹿児島県",
  "沖縄県",
] as const;

export type JapanPrefecture = (typeof JAPAN_PREFECTURES)[number];

export type LifeProximityHit = {
  payee: string;
  amount: number;
  projectCount: number;
  topProjects: string[];
  matchKind: "address" | "municipal-name" | "both";
  sampleAddress: string | null;
};

export type LifeProximityProjectHit = {
  project: string;
  ministry: string;
  amount: number;
  payeeCount: number;
};

export type LifeProximityQuery = {
  prefecture: string;
  city?: string | null;
};

export type LifeProximityResult = {
  year: number;
  unit: string;
  prefecture: string;
  city: string | null;
  totals: {
    amount: number;
    payeeCount: number;
    projectCount: number;
    flowCount: number;
    addressMatchedFlows: number;
  };
  payees: LifeProximityHit[];
  projects: LifeProximityProjectHit[];
  emptyReason: string | null;
  sourceLabel: string;
};

export function normalizePrefectureInput(raw: string): string | null {
  const text = raw.normalize("NFKC").trim();
  if (!text) return null;
  const exact = JAPAN_PREFECTURES.find((p) => p === text);
  if (exact) return exact;
  const withSuffix = JAPAN_PREFECTURES.find(
    (p) => p === `${text}県` || p === `${text}府` || p === `${text}都` || text === "北海",
  );
  if (withSuffix) return withSuffix;
  if (text === "東京") return "東京都";
  if (text === "大阪") return "大阪府";
  if (text === "京都") return "京都府";
  if (text === "北海" || text === "北海道") return "北海道";
  const stripped = JAPAN_PREFECTURES.find(
    (p) => p.replace(/[都道府県]$/u, "") === text.replace(/[都道府県]$/u, ""),
  );
  return stripped ?? null;
}

export function normalizeCityInput(raw: string | null | undefined): string | null {
  const text = (raw || "").normalize("NFKC").trim();
  if (!text) return null;
  return text.replace(/\s+/g, "");
}

/** 住所文字列が都道府県（と任意の市区町村）に触れるか */
export function addressMatchesPlace(
  address: string | null | undefined,
  prefecture: string,
  city: string | null,
): boolean {
  const addr = (address || "").normalize("NFKC");
  if (!addr || !prefecture) return false;
  if (!addr.includes(prefecture)) {
    const short = prefecture.replace(/[都道府県]$/u, "");
    if (!(short.length >= 2 && addr.includes(short))) return false;
  }
  if (city && !addr.includes(city)) return false;
  return true;
}

/** 支出先名が自治体っぽく、指定地域に触れるか */
export function payeeNameMatchesPlace(
  payee: string | null | undefined,
  prefecture: string,
  city: string | null,
): boolean {
  const name = (payee || "").normalize("NFKC").trim();
  if (!name) return false;
  const looksMunicipal =
    /[都道府県市区町村]|広域連合|一部事務組合|企業団|事務組合|地方公共団体/.test(name);
  if (!looksMunicipal) return false;
  if (city) return name.includes(city);
  const short = prefecture.replace(/[都道府県]$/u, "");
  return name.includes(prefecture) || (short.length >= 2 && name.includes(short));
}

export type LifeProximityFlowInput = {
  payee: string;
  project: string;
  ministry: string;
  amount: number;
  address?: string | null;
};

/** 行集合から生活接点ヒットを集計（純関数） */
export function buildLifeProximityFromFlows(
  flows: LifeProximityFlowInput[],
  query: LifeProximityQuery,
  meta: { year: number; unit: string; sourceLabel: string },
): LifeProximityResult {
  const prefecture = normalizePrefectureInput(query.prefecture) ?? query.prefecture.trim();
  const city = normalizeCityInput(query.city);

  type PayeeAgg = {
    amount: number;
    projects: Map<string, number>;
    addressHit: boolean;
    nameHit: boolean;
    sampleAddress: string | null;
  };
  type ProjectAgg = {
    ministry: string;
    amount: number;
    payees: Set<string>;
  };

  const byPayee = new Map<string, PayeeAgg>();
  const byProject = new Map<string, ProjectAgg>();
  let matchedAmount = 0;
  let flowCount = 0;
  let addressMatchedFlows = 0;

  for (const flow of flows) {
    const addrHit = addressMatchesPlace(flow.address, prefecture, city);
    const nameHit = payeeNameMatchesPlace(flow.payee, prefecture, city);
    if (!addrHit && !nameHit) continue;

    const amount = Number(flow.amount) || 0;
    if (!(amount > 0)) continue;
    flowCount += 1;
    matchedAmount += amount;
    if (addrHit) addressMatchedFlows += 1;

    const payee = flow.payee.trim() || "（支出先不明）";
    const payeeAgg = byPayee.get(payee) ?? {
      amount: 0,
      projects: new Map<string, number>(),
      addressHit: false,
      nameHit: false,
      sampleAddress: null,
    };
    payeeAgg.amount += amount;
    payeeAgg.addressHit = payeeAgg.addressHit || addrHit;
    payeeAgg.nameHit = payeeAgg.nameHit || nameHit;
    if (!payeeAgg.sampleAddress && flow.address) payeeAgg.sampleAddress = flow.address;
    const projectName = flow.project.trim() || "（事業不明）";
    payeeAgg.projects.set(
      projectName,
      (payeeAgg.projects.get(projectName) ?? 0) + amount,
    );
    byPayee.set(payee, payeeAgg);

    const projectAgg = byProject.get(projectName) ?? {
      ministry: flow.ministry,
      amount: 0,
      payees: new Set<string>(),
    };
    projectAgg.amount += amount;
    projectAgg.payees.add(payee);
    if (flow.ministry) projectAgg.ministry = flow.ministry;
    byProject.set(projectName, projectAgg);
  }

  const payees: LifeProximityHit[] = [...byPayee.entries()]
    .map(([payee, agg]) => {
      const topProjects = [...agg.projects.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([name]) => name);
      const matchKind: LifeProximityHit["matchKind"] =
        agg.addressHit && agg.nameHit ? "both" : agg.addressHit ? "address" : "municipal-name";
      return {
        payee,
        amount: Math.round(agg.amount * 10) / 10,
        projectCount: agg.projects.size,
        topProjects,
        matchKind,
        sampleAddress: agg.sampleAddress,
      };
    })
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 40);

  const projects: LifeProximityProjectHit[] = [...byProject.entries()]
    .map(([project, agg]) => ({
      project,
      ministry: agg.ministry,
      amount: Math.round(agg.amount * 10) / 10,
      payeeCount: agg.payees.size,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 25);

  let emptyReason: string | null = null;
  if (payees.length === 0) {
    emptyReason = city
      ? `「${prefecture}${city}」に住所・自治体名で結びつく支出先が、この年度の公開明細から見つかりませんでした。都道府県だけでもう一度探すか、公式見える化サイトで確認してください。`
      : `「${prefecture}」に住所・自治体名で結びつく支出先が、この年度の公開明細から見つかりませんでした。`;
  }

  return {
    year: meta.year,
    unit: meta.unit,
    prefecture,
    city,
    totals: {
      amount: Math.round(matchedAmount * 10) / 10,
      payeeCount: byPayee.size,
      projectCount: byProject.size,
      flowCount,
      addressMatchedFlows,
    },
    payees,
    projects,
    emptyReason,
    sourceLabel: meta.sourceLabel,
  };
}
