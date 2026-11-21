/**
 * scripts/build-ip-country.mjs が作るバイナリを読み、IP → 国コードを二分探索で返す。
 * IP そのものは保存しない（呼び出し側で国コードだけを残す）。
 */

export type IpCountryTable = {
  countries: string[];
  v4Start: Uint32Array;
  v4Idx: Uint8Array;
  v6Hi: Uint32Array;
  v6Lo: Uint32Array;
  v6Idx: Uint8Array;
};

export function parseIpCountryTable(data: ArrayBuffer | Uint8Array): IpCountryTable {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let o = 0;
  const magic = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!);
  if (magic !== "IPC1") throw new Error("ip-country: 形式が違います");
  o = 4;
  const nc = view.getUint32(o, true);
  o += 4;
  const countries: string[] = [];
  for (let i = 0; i < nc; i += 1) {
    countries.push(String.fromCharCode(bytes[o]!, bytes[o + 1]!));
    o += 2;
  }
  const readU32 = (n: number) => {
    const arr = new Uint32Array(n);
    for (let i = 0; i < n; i += 1) {
      arr[i] = view.getUint32(o, true);
      o += 4;
    }
    return arr;
  };
  const readU8 = (n: number) => {
    const arr = bytes.slice(o, o + n);
    o += n;
    return arr;
  };
  const n4 = view.getUint32(o, true);
  o += 4;
  const v4Start = readU32(n4);
  const v4Idx = readU8(n4);
  const n6 = view.getUint32(o, true);
  o += 4;
  const v6Hi = readU32(n6);
  const v6Lo = readU32(n6);
  const v6Idx = readU8(n6);
  return { countries, v4Start, v4Idx, v6Hi, v6Lo, v6Idx };
}

function parseV4(ip: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const p = m.slice(1).map(Number);
  if (p.some((x) => x > 255)) return null;
  return ((p[0]! << 24) >>> 0) + (p[1]! << 16) + (p[2]! << 8) + p[3]!;
}

function parseV6Prefix(ip: string): [number, number] | null {
  if (!ip.includes(":")) return null;
  const clean = ip.split("%")[0]!;
  const parts = clean.split("::");
  if (parts.length > 2) return null;
  const head = parts[0] ? parts[0].split(":") : [];
  const tail = parts[1] ? parts[1].split(":") : [];
  const fill = parts.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0) return null;
  const groups = [...head, ...Array(fill).fill("0"), ...tail];
  if (groups.length < 4) return null;
  const g = groups.slice(0, 4).map((x) => parseInt(x || "0", 16));
  if (g.some((x) => !Number.isFinite(x) || x < 0 || x > 0xffff)) return null;
  return [((g[0]! << 16) >>> 0) + g[1]!, ((g[2]! << 16) >>> 0) + g[3]!];
}

function upperBound(n: number, le: (i: number) => boolean): number {
  let lo = 0;
  let hi = n - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (le(mid)) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

/** 国コード（ISO 3166-1 alpha-2）。判定不能・予約帯は null */
export function lookupIpCountry(table: IpCountryTable, rawIp: string): string | null {
  let ip = rawIp.trim();
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  const v4 = parseV4(ip);
  let code: string | undefined;
  if (v4 != null) {
    const i = upperBound(table.v4Start.length, (k) => table.v4Start[k]! <= v4);
    code = i >= 0 ? table.countries[table.v4Idx[i]!] : undefined;
  } else {
    const v6 = parseV6Prefix(ip);
    if (!v6) return null;
    const [hi, lo] = v6;
    const i = upperBound(table.v6Hi.length, (k) => {
      const h = table.v6Hi[k]!;
      return h < hi || (h === hi && table.v6Lo[k]! <= lo);
    });
    code = i >= 0 ? table.countries[table.v6Idx[i]!] : undefined;
  }
  if (!code || code === "ZZ") return null;
  return code;
}
