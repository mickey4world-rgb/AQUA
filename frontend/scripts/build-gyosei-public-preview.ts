/**
 * 公開サンキー用の軽量スナップショットを事前生成する。
 * Usage: npx --yes tsx scripts/build-gyosei-public-preview.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { listGyoseiYears, queryMoneyFlow } from "../lib/server/gyosei-data";

async function main() {
  const years = listGyoseiYears();
  const year = years[years.length - 1] ?? years[0];
  console.log(`[gyosei-preview] building year=${year} ...`);
  const started = Date.now();
  const snapshot = await queryMoneyFlow({
    year,
    limit: 40,
    rowMode: "aggregate",
  });
  const outDir = path.join(process.cwd(), "data", "gyosei");
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "public-preview.json");
  const body = JSON.stringify(snapshot);
  writeFileSync(outPath, body);
  console.log(
    `[gyosei-preview] wrote ${outPath} (${Math.round((Date.now() - started) / 1000)}s, ${Buffer.byteLength(body)} bytes)`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
