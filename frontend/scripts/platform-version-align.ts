/**
 * SWA Managed API が許す最大 Node に、リポジトリ内のピンを揃える。
 *   npx tsx scripts/platform-version-align.ts
 *   npx tsx scripts/platform-version-align.ts --apply
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  FRONTEND_PACKAGE_PATH,
  GEMINI_PROXY_PACKAGE_PATH,
  KABU_BRIDGE_PACKAGE_PATH,
  SWA_CONFIG_PATH,
  applyNodeMajorToFile,
  buildAlignPlan,
  filesToAlign,
} from "../lib/platform-versions";

const APPLY = process.argv.includes("--apply");
const ROOT = join(import.meta.dirname, "..", "..");
const SWA_DOCS_URL =
  process.env.SWA_RUNTIME_DOCS_URL?.trim() ||
  "https://learn.microsoft.com/en-us/azure/static-web-apps/languages-runtimes";

function readRepo(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

function listWorkflows(): Array<{ path: string; content: string }> {
  const dir = join(ROOT, ".github", "workflows");
  return readdirSync(dir)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .map((name) => {
      const path = `.github/workflows/${name}`;
      return { path, content: readRepo(path) };
    });
}

async function fetchSwaDocs(): Promise<string> {
  const res = await fetch(SWA_DOCS_URL, {
    headers: { "user-agent": "aquacore-platform-version-align/1.0" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`SWA docs HTTP ${res.status}`);
  return res.text();
}

async function main() {
  const swaDocsText = await fetchSwaDocs();
  const plan = buildAlignPlan({
    swaDocsText,
    swaConfigJson: readRepo(SWA_CONFIG_PATH),
    packages: [
      { path: FRONTEND_PACKAGE_PATH, content: readRepo(FRONTEND_PACKAGE_PATH) },
      { path: GEMINI_PROXY_PACKAGE_PATH, content: readRepo(GEMINI_PROXY_PACKAGE_PATH) },
      { path: KABU_BRIDGE_PACKAGE_PATH, content: readRepo(KABU_BRIDGE_PACKAGE_PATH) },
    ],
    workflows: listWorkflows(),
    docs: [{ path: "README_DESIGN.md", content: readRepo("README_DESIGN.md") }],
  });

  const todo = filesToAlign(plan);
  const changed: string[] = [];

  if (APPLY && plan.targetMajor != null && todo.length > 0) {
    for (const { path } of todo) {
      const before = readRepo(path);
      const after = applyNodeMajorToFile(path, before, plan.targetMajor);
      if (after) {
        writeFileSync(join(ROOT, path), after, "utf8");
        changed.push(path);
      }
    }
  }

  const report = {
    ok: plan.parseError == null,
    constraint: "azure-static-web-apps-managed-api",
    docsUrl: SWA_DOCS_URL,
    swaMaxMajor: plan.swaMaxMajor,
    targetMajor: plan.targetMajor,
    parseError: plan.parseError,
    behind: plan.behind.map((p) => ({ path: p.path, major: p.currentMajor, kind: p.kind })),
    ahead: plan.ahead.map((p) => ({ path: p.path, major: p.currentMajor, kind: p.kind })),
    todo: todo.map((t) => t.path),
    applied: APPLY,
    changed,
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (plan.parseError) process.exitCode = 2;
  else if (todo.length > 0 && !APPLY) process.exitCode = 3;
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  process.exit(1);
});
