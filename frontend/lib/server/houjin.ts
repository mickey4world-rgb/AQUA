/**
 * 国税庁 法人番号システム Web-API（名称検索）。
 * アプリ ID は無料発行。未設定時は null を返し、呼び出し側でレビューデータのみにフォールバックする。
 *
 * https://www.houjin-bangou.nta.go.jp/webapi/
 */

export type HoujinCompany = {
  corporateNumber: string;
  name: string;
  prefecture: string;
  city: string;
  street: string;
  address: string;
};

export function isHoujinConfigured(): boolean {
  return Boolean(process.env.HOUJIN_BANGOU_APP_ID?.trim());
}

export async function searchHoujinByName(
  name: string,
  limit = 8,
): Promise<HoujinCompany[]> {
  const appId = process.env.HOUJIN_BANGOU_APP_ID?.trim();
  if (!appId || !name.trim()) return [];

  const url = new URL("https://api.houjin-bangou.nta.go.jp/4/name");
  url.searchParams.set("id", appId);
  url.searchParams.set("name", name.trim().slice(0, 100));
  url.searchParams.set("type", "02"); // Unicode CSV
  url.searchParams.set("mode", "2"); // 部分一致
  url.searchParams.set("target", "1");
  url.searchParams.set("change", "0");

  const response = await fetch(url, {
    headers: { Accept: "text/csv,*/*" },
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    console.warn("[houjin]", response.status, await response.text().catch(() => ""));
    return [];
  }

  const text = await response.text();
  return parseHoujinCsv(text).slice(0, limit);
}

function parseHoujinCsv(text: string): HoujinCompany[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  // 先頭行はヘッダ要約のことがあるので、法人番号らしい 13 桁を含む行だけ拾う。
  const companies: HoujinCompany[] = [];
  for (const line of lines) {
    const cols = splitCsvLine(line);
    if (cols.length < 10) continue;
    const corporateNumber = cols.find((col) => /^\d{13}$/.test(col));
    if (!corporateNumber) continue;

    // Ver.4 CSV: 一連番号,法人番号,処理区分,... 商号,法人種別,都道府県,市区町村,丁目番地...
    const numberIndex = cols.indexOf(corporateNumber);
    const name = cols[numberIndex + 5] || cols[numberIndex + 4] || "";
    const prefecture = cols[numberIndex + 7] || "";
    const city = cols[numberIndex + 8] || "";
    const street = cols[numberIndex + 9] || "";
    if (!name || name === "商号又は名称") continue;

    companies.push({
      corporateNumber,
      name: name.trim(),
      prefecture: prefecture.trim(),
      city: city.trim(),
      street: street.trim(),
      address: [prefecture, city, street].map((part) => part.trim()).filter(Boolean).join(""),
    });
  }

  // 重複法人番号を除去
  const seen = new Set<string>();
  return companies.filter((company) => {
    if (seen.has(company.corporateNumber)) return false;
    seen.add(company.corporateNumber);
    return true;
  });
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  result.push(current);
  return result;
}

/** 住所文字列から都道府県・市区町村を粗く切り出す（NTA 応答が欠けたとき用）。 */
export function parseJapanAddress(address: string): { prefecture: string; city: string } {
  const normalized = address.normalize("NFKC");
  const prefMatch = normalized.match(
    /(...??[都道府県]|北海道)/,
  );
  const prefecture = prefMatch?.[0] ?? "";
  const rest = prefecture ? normalized.slice(normalized.indexOf(prefecture) + prefecture.length) : normalized;
  const cityMatch = rest.match(/^(.+?(?:市|区|町|村|郡))/);
  return { prefecture, city: cityMatch?.[1] ?? "" };
}
