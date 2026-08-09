/**
 * 支出先のマイナス点を公開情報から補完する。
 * - 国交省ネガティブ情報（指名停止、直近5年）
 * - Wikipedia（日英）の評価・概要
 * - Yahoo Finance（上場なら株価推移＝財務不安の代理）
 */

import { normalizeCompanyQuery } from "@/lib/server/company-address";
import type { PayeeDossier, PayeeIssue } from "@/lib/types/gyosei";

export type SuspensionRecord = {
  date: string;
  agency: string;
  company: string;
  address: string;
  type: string;
  overviewUrl: string | null;
  detailUrl: string | null;
};

export type ReputationSnapshot = {
  japanTitle: string | null;
  japanSummary: string | null;
  japanUrl: string | null;
  worldTitle: string | null;
  worldSummary: string | null;
  worldUrl: string | null;
  notes: string[];
};

export type FinanceSnapshot = {
  symbol: string | null;
  exchange: string | null;
  currency: string | null;
  lastPrice: number | null;
  change5yPct: number | null;
  drawdownFromPeakPct: number | null;
  summary: string;
  concern: boolean;
};

const UA = "AQUA-MoneyFlow/1.0 (personal research; https://github.com/mickey4world-rgb/AQUA)";
const NEGATIVE_HINTS =
  /談合|独占禁止|課徴金|逮捕|起訴|不正|詐欺|贈賄|腐敗|リコール|事故|倒産|破綻|赤字|債務超過|指名停止|排除措置|行政処分|不祥事|scandal|cartel|bribery|fraud|lawsuit|fine|ban/i;

export async function enrichPayeeRisk(dossier: PayeeDossier): Promise<PayeeDossier> {
  const searchName = stripLegalSuffix(dossier.name);
  const [suspensions, reputation, finance] = await Promise.all([
    searchMlitSuspensions(searchName, dossier.corporateNumber).catch(() => [] as SuspensionRecord[]),
    fetchReputation(searchName, dossier.name).catch(() => emptyReputation()),
    fetchFinanceSnapshot(searchName, dossier.name).catch(() => emptyFinance("株価情報を取得できませんでした。")),
  ]);

  const extraIssues: PayeeIssue[] = [];

  if (suspensions.length > 0) {
    extraIssues.push({
      level: "caution",
      title: `直近5年で指名停止等 ${suspensions.length} 件`,
      detail: suspensions
        .slice(0, 3)
        .map((row) => `${row.date} ${row.agency}「${row.company}」${row.type}`)
        .join(" / "),
    });
  } else {
    extraIssues.push({
      level: "info",
      title: "国交省ネガティブ情報にヒットなし",
      detail:
        "国土交通省の指名停止検索（直近公開分）では該当がありませんでした。他省庁・自治体の措置は別途確認が必要です。",
    });
  }

  for (const note of reputation.notes) {
    extraIssues.push({
      level: "watch",
      title: "公開百科に注意喚起の記述",
      detail: note,
    });
  }

  if (finance.concern) {
    extraIssues.push({
      level: "caution",
      title: "上場株価に財務不安の兆し",
      detail: finance.summary,
    });
  } else if (finance.symbol) {
    extraIssues.push({
      level: "info",
      title: "上場株価の様子",
      detail: finance.summary,
    });
  }

  const issues = mergeIssues(dossier.issues, extraIssues);
  const procurement = reviseProcurement(dossier.procurement, issues, suspensions.length);

  return {
    ...dossier,
    issues,
    procurement,
    suspensions,
    reputation,
    finance,
  };
}

function emptyReputation(): ReputationSnapshot {
  return {
    japanTitle: null,
    japanSummary: null,
    japanUrl: null,
    worldTitle: null,
    worldSummary: null,
    worldUrl: null,
    notes: [],
  };
}

function emptyFinance(summary: string): FinanceSnapshot {
  return {
    symbol: null,
    exchange: null,
    currency: null,
    lastPrice: null,
    change5yPct: null,
    drawdownFromPeakPct: null,
    summary,
    concern: false,
  };
}

async function searchMlitSuspensions(
  name: string,
  corporateNumber: string,
): Promise<SuspensionRecord[]> {
  const keyword = name.slice(0, 40);
  if (!keyword) return [];

  const now = new Date();
  const startYear = String(now.getFullYear() - 5);
  const body = new URLSearchParams({
    jigyoubunya: "shimeiteishi",
    jigyousya: keyword,
    start_year: startYear,
    start_month: "1",
    end_year: String(now.getFullYear()),
    end_month: String(now.getMonth() + 1),
    shobun: "",
    agency: "",
    pref: "",
    EID: "search",
  });

  const response = await fetch("https://www.mlit.go.jp/nega-inf/cgi-bin/search.cgi", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": UA,
      Referer: "https://www.mlit.go.jp/nega-inf/cgi-bin/search.cgi?jigyoubunya=shimeiteishi",
      Accept: "text/html,*/*",
    },
    body,
    signal: AbortSignal.timeout(12000),
    next: { revalidate: 3600 },
  });
  if (!response.ok) return [];
  const html = await response.text();
  if (/検索結果：0件/.test(html)) return [];
  if (!/class="result"/.test(html)) return [];

  const rows: SuspensionRecord[] = [];
  const rowRe =
    /<tr><td class="date">([^<]*)<\/td><td class="date">([^<]*)<\/td><td class="name">([\s\S]*?)<\/td><td class="address">([^<]*)<\/td><td class="punish">([^<]*)<\/td><td class="detail">([\s\S]*?)<\/td><\/tr>/g;
  for (const match of html.matchAll(rowRe)) {
    const companyHtml = match[3] || "";
    const company = companyHtml.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    const corpMatch = companyHtml.match(/\((\d{13})\)/);
    const overview = (match[6] || "").match(/href="(search\.cgi[^"]+)"/);
    const detail = (match[6] || "").match(/href="(https?:\/\/[^"]+)"/);
    const record: SuspensionRecord = {
      date: (match[1] || "").trim(),
      agency: (match[2] || "").trim(),
      company,
      address: (match[4] || "").trim(),
      type: (match[5] || "").trim(),
      overviewUrl: overview
        ? `https://www.mlit.go.jp/nega-inf/cgi-bin/${overview[1]}`
        : null,
      detailUrl: detail?.[1] ?? null,
    };

    if (corporateNumber && corpMatch && corpMatch[1] !== corporateNumber) {
      // 法人番号が分かっているときは優先一致。違う番号でも社名類似なら残す。
      const sameFamily =
        normalizeCompanyQuery(company).includes(normalizeCompanyQuery(keyword)) ||
        normalizeCompanyQuery(keyword).includes(normalizeCompanyQuery(company));
      if (!sameFamily) continue;
    }
    rows.push(record);
  }
  return rows.slice(0, 12);
}

async function fetchReputation(
  shortName: string,
  fullName: string,
): Promise<ReputationSnapshot> {
  const ja = await wikipediaSummary("ja", shortName).catch(() => null);
  const jaFallback =
    ja ?? (await wikipediaSummary("ja", fullName).catch(() => null));
  const enTitle =
    (await wikipediaSearchTitle("en", shortName).catch(() => null)) ||
    (await wikipediaSearchTitle("en", fullName).catch(() => null));
  const en = enTitle ? await wikipediaSummary("en", enTitle).catch(() => null) : null;

  const notes: string[] = [];
  for (const page of [jaFallback, en]) {
    if (!page?.extract) continue;
    if (NEGATIVE_HINTS.test(page.extract)) {
      const snippet = page.extract.replace(/\s+/g, " ").slice(0, 180);
      notes.push(`${page.lang === "ja" ? "日本語" : "英語"}Wikipedia: ${snippet}`);
    }
  }

  return {
    japanTitle: jaFallback?.title ?? null,
    japanSummary: jaFallback?.extract?.slice(0, 280) ?? null,
    japanUrl: jaFallback?.url ?? null,
    worldTitle: en?.title ?? null,
    worldSummary: en?.extract?.slice(0, 280) ?? null,
    worldUrl: en?.url ?? null,
    notes: notes.slice(0, 3),
  };
}

async function wikipediaSummary(lang: "ja" | "en", title: string) {
  const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const response = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(8000),
    next: { revalidate: 86400 },
  });
  if (!response.ok) return null;
  const data = (await response.json()) as {
    title?: string;
    extract?: string;
    content_urls?: { desktop?: { page?: string } };
    type?: string;
  };
  if (data.type === "disambiguation" || !data.extract) return null;
  return {
    lang,
    title: data.title || title,
    extract: data.extract,
    url: data.content_urls?.desktop?.page || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`,
  };
}

async function wikipediaSearchTitle(lang: "ja" | "en", query: string) {
  const url = new URL(`https://${lang}.wikipedia.org/w/api.php`);
  url.searchParams.set("action", "opensearch");
  url.searchParams.set("search", query);
  url.searchParams.set("limit", "1");
  url.searchParams.set("namespace", "0");
  url.searchParams.set("format", "json");
  const response = await fetch(url, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(8000),
    next: { revalidate: 86400 },
  });
  if (!response.ok) return null;
  const data = (await response.json()) as [string, string[]];
  return data[1]?.[0] ?? null;
}

async function fetchFinanceSnapshot(
  shortName: string,
  fullName: string,
): Promise<FinanceSnapshot> {
  const symbol = await resolveYahooSymbol(shortName, fullName);
  if (!symbol) {
    return emptyFinance("上場銘柄として特定できなかったため、株価ベースの財務不安は未評価です。");
  }

  const url = new URL(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  url.searchParams.set("interval", "1mo");
  url.searchParams.set("range", "5y");
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
    next: { revalidate: 3600 },
  });
  if (!response.ok) {
    return emptyFinance(`株価APIを取得できませんでした（${symbol}）。`);
  }
  const json = (await response.json()) as {
    chart?: {
      result?: Array<{
        meta?: {
          symbol?: string;
          exchangeName?: string;
          currency?: string;
          regularMarketPrice?: number;
        };
        indicators?: { quote?: Array<{ close?: Array<number | null> }> };
      }>;
    };
  };
  const result = json.chart?.result?.[0];
  const closes = (result?.indicators?.quote?.[0]?.close || []).filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
  if (!result || closes.length < 2) {
    return emptyFinance(`${symbol} の十分な株価履歴がありません。`);
  }

  const first = closes[0]!;
  const last = closes[closes.length - 1]!;
  const peak = Math.max(...closes);
  const change5yPct = first > 0 ? (last - first) / first : null;
  const drawdownFromPeakPct = peak > 0 ? (last - peak) / peak : null;
  const concern =
    (change5yPct != null && change5yPct <= -0.25) ||
    (drawdownFromPeakPct != null && drawdownFromPeakPct <= -0.35);

  const bits = [
    `${symbol}（${result.meta?.exchangeName || "市場不明"}）`,
    change5yPct != null ? `5年騰落 ${pct(change5yPct)}` : null,
    drawdownFromPeakPct != null ? `高値からの下落 ${pct(drawdownFromPeakPct)}` : null,
    typeof result.meta?.regularMarketPrice === "number"
      ? `直近 ${result.meta.regularMarketPrice.toLocaleString("ja-JP")} ${result.meta.currency || ""}`
      : null,
  ].filter(Boolean);

  return {
    symbol,
    exchange: result.meta?.exchangeName ?? null,
    currency: result.meta?.currency ?? null,
    lastPrice: result.meta?.regularMarketPrice ?? last,
    change5yPct,
    drawdownFromPeakPct,
    summary: concern
      ? `${bits.join(" / ")}。株価面では財務・信用リスクを慎重に見た方がよいです。`
      : `${bits.join(" / ")}。株価面の大きな毀損は見当たりません。`,
    concern,
  };
}

async function resolveYahooSymbol(shortName: string, fullName: string) {
  for (const query of [shortName, fullName, `${shortName} 株`]) {
    const url = new URL("https://query1.finance.yahoo.com/v1/finance/search");
    url.searchParams.set("q", query);
    url.searchParams.set("quotesCount", "6");
    url.searchParams.set("newsCount", "0");
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 86400 },
    });
    if (!response.ok) continue;
    const data = (await response.json()) as {
      quotes?: Array<{ symbol?: string; shortname?: string; longname?: string; exchange?: string; quoteType?: string }>;
    };
    const quotes = data.quotes || [];
    const scored = quotes
      .filter((quote) => quote.symbol && (!quote.quoteType || quote.quoteType === "EQUITY"))
      .map((quote) => {
        const label = `${quote.shortname || ""} ${quote.longname || ""}`;
        const needle = normalizeCompanyQuery(shortName);
        const labelKey = normalizeCompanyQuery(label);
        let score = 0;
        if (labelKey.includes(needle) || needle.includes(normalizeCompanyQuery(quote.shortname || ""))) {
          score += 5;
        }
        if ((quote.symbol || "").endsWith(".T")) score += 2;
        if ((quote.exchange || "").includes("JP") || quote.exchange === "TYO") score += 2;
        return { symbol: quote.symbol!, score };
      })
      .filter((row) => row.score >= 5)
      .sort((a, b) => b.score - a.score);
    if (scored[0]) return scored[0].symbol;
  }
  return null;
}

function stripLegalSuffix(name: string): string {
  return name
    .replace(/株式会社|有限会社|合同会社|合名会社|合資会社|\(株\)|（株）|\(有\)|（有）/g, "")
    .trim();
}

function mergeIssues(base: PayeeIssue[], extra: PayeeIssue[]): PayeeIssue[] {
  const seen = new Set(base.map((issue) => issue.title));
  const merged = [...base];
  for (const issue of extra) {
    if (seen.has(issue.title)) continue;
    seen.add(issue.title);
    merged.push(issue);
  }
  const rank = { caution: 0, watch: 1, info: 2 };
  return merged.sort((a, b) => rank[a.level] - rank[b.level]);
}

function reviseProcurement(
  current: PayeeDossier["procurement"],
  issues: PayeeIssue[],
  suspensionCount: number,
): PayeeDossier["procurement"] {
  const cautionCount = issues.filter((issue) => issue.level === "caution").length;
  if (suspensionCount > 0 || cautionCount >= 2) {
    return {
      verdict: "慎重に判断",
      summary:
        "指名停止や株価毀損など、公開情報上のマイナス点があります。期間・理由・再発防止を確認してから調達判断してください。",
    };
  }
  if (cautionCount >= 1 || issues.some((issue) => issue.level === "watch")) {
    return {
      verdict: "注意して確認",
      summary: current.summary.includes("注意")
        ? current.summary
        : "大きな欠格は断定できませんが、公開情報に確認すべき点があります。",
    };
  }
  return current;
}

function pct(value: number): string {
  const signed = value > 0 ? `+${(value * 100).toFixed(0)}` : `${(value * 100).toFixed(0)}`;
  return `${signed}%`;
}
