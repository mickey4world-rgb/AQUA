import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { lookupIpCountry, parseIpCountryTable } from "./ip-country-lookup";

const table = parseIpCountryTable(
  readFileSync(join(process.cwd(), "public", "vendor", "geo", "ip-country.bin")),
);

assert.ok(table.countries.length > 200);
assert.ok(table.v4Start.length > 100_000);

// 公開 DNS・大手のよく知られたアドレス帯
assert.equal(lookupIpCountry(table, "8.8.8.8"), "US");
assert.equal(lookupIpCountry(table, "1.1.1.1") !== null, true);
assert.equal(lookupIpCountry(table, "::ffff:8.8.8.8"), "US");
assert.equal(lookupIpCountry(table, "2400:2410::1"), "JP");
assert.equal(lookupIpCountry(table, "133.242.0.1"), "JP");
assert.equal(lookupIpCountry(table, "114.114.114.114"), "CN");
assert.equal(lookupIpCountry(table, "77.88.8.8"), "RU");

// 予約帯・不正値は null
assert.equal(lookupIpCountry(table, "10.0.0.1"), null);
assert.equal(lookupIpCountry(table, "127.0.0.1"), null);
assert.equal(lookupIpCountry(table, "unknown"), null);
assert.equal(lookupIpCountry(table, "999.1.1.1"), null);

console.log("ip-country-lookup.test.ts: ok");
