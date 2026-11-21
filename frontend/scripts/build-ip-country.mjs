// DB-IP「IP to Country Lite」（CC BY 4.0）から IP→国 の二分探索用バイナリを作る。
// 出力: public/vendor/geo/ip-country.bin（匿名パス。サーバーが起動時に1回だけ読む）
// 形式（リトルエンディアン）:
//   "IPC1" | u32 国数 | 国コード2byte×国数
//   u32 v4件数 | u32 開始×件数 | u8 国番号×件数
//   u32 v6件数 | u32 上位×件数 | u32 下位×件数 | u8 国番号×件数（先頭64bitで判定）
import { gunzipSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "vendor", "geo", "ip-country.bin");

function monthCandidates() {
  const now = new Date();
  const list = [];
  for (let back = 0; back < 3; back += 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1));
    list.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return list;
}

async function download() {
  for (const ym of monthCandidates()) {
    const url = `https://download.db-ip.com/free/dbip-country-lite-${ym}.csv.gz`;
    const res = await fetch(url, { headers: { "User-Agent": "aqua-geo-build" } });
    if (res.ok) {
      return { ym, text: gunzipSync(Buffer.from(await res.arrayBuffer())).toString("utf8") };
    }
  }
  throw new Error("DB-IP country lite を取得できませんでした");
}

function v4ToInt(ip) {
  const p = ip.split(".").map(Number);
  return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
}

function v6Prefix(ip) {
  const [head, tail = ""] = ip.split("::");
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const groups = ip.includes("::")
    ? [...h, ...Array(8 - h.length - t.length).fill("0"), ...t]
    : h;
  const g = groups.map((x) => parseInt(x || "0", 16));
  return [((g[0] << 16) >>> 0) + g[1], ((g[2] << 16) >>> 0) + g[3]];
}

const { ym, text } = await download();
const countries = [];
const index = new Map();
const idx = (c) => {
  if (!index.has(c)) {
    index.set(c, countries.length);
    countries.push(c);
  }
  return index.get(c);
};

const v4 = [];
const v6 = [];
for (const line of text.split("\n")) {
  if (!line) continue;
  const [start, , cc] = line.split(",");
  const country = (cc || "ZZ").trim().toUpperCase().slice(0, 2);
  if (start.includes(":")) {
    const [hi, lo] = v6Prefix(start);
    const last = v6[v6.length - 1];
    if (last && last.hi === hi && last.lo === lo) {
      last.c = idx(country);
      continue;
    }
    if (last && countries[last.c] === country) continue;
    v6.push({ hi, lo, c: idx(country) });
  } else {
    const s = v4ToInt(start);
    const last = v4[v4.length - 1];
    if (last && countries[last.c] === country) continue;
    v4.push({ s, c: idx(country) });
  }
}

const size = 4 + 4 + countries.length * 2 + 4 + v4.length * 5 + 4 + v6.length * 9;
const buf = Buffer.alloc(size);
let o = 0;
buf.write("IPC1", o, "ascii");
o += 4;
buf.writeUInt32LE(countries.length, o);
o += 4;
for (const c of countries) {
  buf.write(c.padEnd(2, "Z"), o, "ascii");
  o += 2;
}
buf.writeUInt32LE(v4.length, o);
o += 4;
for (const r of v4) {
  buf.writeUInt32LE(r.s, o);
  o += 4;
}
for (const r of v4) buf.writeUInt8(r.c, o++);
buf.writeUInt32LE(v6.length, o);
o += 4;
for (const r of v6) {
  buf.writeUInt32LE(r.hi, o);
  o += 4;
}
for (const r of v6) {
  buf.writeUInt32LE(r.lo, o);
  o += 4;
}
for (const r of v6) buf.writeUInt8(r.c, o++);

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, buf);
writeFileSync(
  join(dirname(out), "ip-country.json"),
  JSON.stringify(
    {
      source: "DB-IP IP to Country Lite",
      license: "CC BY 4.0 (https://db-ip.com)",
      edition: ym,
      builtAt: new Date().toISOString(),
      countries: countries.length,
      v4Ranges: v4.length,
      v6Ranges: v6.length,
      bytes: buf.length,
    },
    null,
    2,
  ),
);
console.log(`ip-country.bin ${ym}: v4 ${v4.length}, v6 ${v6.length}, ${(buf.length / 1e6).toFixed(2)} MB`);
