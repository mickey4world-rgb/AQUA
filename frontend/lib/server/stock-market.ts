import YahooFinance from "yahoo-finance2";
import type { PriceChangeContext } from "@/lib/types/stock";
import type { StockMarket } from "@/lib/types/stock";
import { normalizeTicker } from "@/lib/stock-utils";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const RECENT_NEWS_DAYS = 7;
const MAX_CONTEXT_ITEMS = 4;

type SearchQuote = {
  symbol?: string;
  quoteType?: string;
  longname?: string;
  shortname?: string;
};

type SearchNews = {
  title?: string;
  publisher?: string;
  providerPublishTime?: number | string | Date;
  link?: string;
  relatedTickers?: string[];
};

function isEquityQuote(quote: unknown): quote is SearchQuote {
  return typeof quote === "object" && quote !== null;
}

function isNewsArticle(article: unknown): article is SearchNews {
  return typeof article === "object" && article !== null;
}

function isWithinDays(isoDate: string | Date | undefined, days: number): boolean {
  if (!isoDate) return false;
  const published = new Date(isoDate).getTime();
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return published >= cutoff;
}

export async function resolveStockName(
  ticker: string,
  market: StockMarket = "us",
): Promise<string | null> {
  const symbol = normalizeTicker(ticker, market);
  const result = await yahooFinance.search(symbol, { quotesCount: 5, newsCount: 0 });
  const quotes: SearchQuote[] = (result.quotes ?? [])
    .filter(isEquityQuote)
    .map((quote) => quote as SearchQuote);
  const match =
    quotes.find(
      (quote) =>
        quote.symbol?.toUpperCase() === symbol.toUpperCase() &&
        quote.quoteType === "EQUITY",
    ) ?? quotes[0];

  if (!match) return null;
  return match.longname ?? match.shortname ?? null;
}

export async function fetchPriceChangeContext(
  ticker: string,
  market: StockMarket = "us",
): Promise<PriceChangeContext[]> {
  const symbol = normalizeTicker(ticker, market);
  const [searchResult, insights] = await Promise.all([
    yahooFinance.search(symbol, { quotesCount: 0, newsCount: 10 }),
    yahooFinance.insights(symbol).catch(() => null),
  ]);

  const items: PriceChangeContext[] = [];

  for (const dev of insights?.sigDevs ?? []) {
    if (!dev.headline || !isWithinDays(dev.date, RECENT_NEWS_DAYS)) continue;
    items.push({
      title: dev.headline,
      source: "Yahoo Finance",
      publishedAt:
        dev.date instanceof Date
          ? dev.date.toISOString()
          : new Date(dev.date).toISOString(),
      kind: "development",
    });
  }

  for (const article of (searchResult.news ?? [])
    .filter(isNewsArticle)
    .map((item) => item as SearchNews)) {
    if (!article.title) continue;
    if (!article.relatedTickers?.includes(symbol)) continue;

    const publishedAt =
      article.providerPublishTime instanceof Date
        ? article.providerPublishTime.toISOString()
        : typeof article.providerPublishTime === "number"
          ? new Date(article.providerPublishTime * 1000).toISOString()
          : article.providerPublishTime
            ? new Date(article.providerPublishTime).toISOString()
            : undefined;

    if (!isWithinDays(publishedAt, RECENT_NEWS_DAYS)) continue;

    items.push({
      title: article.title,
      source: article.publisher,
      publishedAt,
      link: article.link,
      kind: "news",
    });
  }

  const seen = new Set<string>();
  return items
    .sort(
      (a, b) =>
        new Date(b.publishedAt ?? 0).getTime() -
        new Date(a.publishedAt ?? 0).getTime(),
    )
    .filter((item) => {
      const key = item.title.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_CONTEXT_ITEMS);
}
