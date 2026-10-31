import assert from "node:assert/strict";
import {
  applyNodeMajorToFile,
  buildAlignPlan,
  filesToAlign,
  parseSwaNodeMaxMajor,
  readApiRuntimeMajor,
  readEnginesMajor,
} from "./platform-versions";

assert.equal(parseSwaNodeMaxMajor("node:20 and node:22"), 22);
assert.equal(parseSwaNodeMaxMajor("no runtimes"), null);
assert.equal(readApiRuntimeMajor(JSON.stringify({ platform: { apiRuntime: "node:22" } })), 22);
assert.equal(readEnginesMajor(JSON.stringify({ engines: { node: ">=22" } })), 22);

{
  const plan = buildAlignPlan({
    swaDocsText: "`node:20` `node:22`",
    swaConfigJson: JSON.stringify({ platform: { apiRuntime: "node:20" } }),
    packages: [
      { path: "frontend/package.json", content: JSON.stringify({ engines: { node: ">=20" } }) },
      { path: "gemini-proxy/package.json", content: JSON.stringify({ engines: { node: ">=24" } }) },
    ],
    workflows: [
      {
        path: ".github/workflows/x.yml",
        content: 'node-version: "20"\nnode-version: "22"\n',
      },
    ],
    docs: [{ path: "README_DESIGN.md", content: "API（Node 20）" }],
  });
  assert.equal(plan.targetMajor, 22);
  assert.ok(plan.behind.some((p) => p.path === "frontend/staticwebapp.config.json"));
  assert.ok(plan.ahead.some((p) => p.path === "gemini-proxy/package.json" && p.currentMajor === 24));
  assert.ok(filesToAlign(plan).some((f) => f.path === "gemini-proxy/package.json"));
}

{
  const bumped = applyNodeMajorToFile(
    "frontend/staticwebapp.config.json",
    JSON.stringify({ platform: { apiRuntime: "node:20" } }, null, 2),
    22,
  );
  assert.ok(bumped?.includes("node:22"));
  assert.equal(
    applyNodeMajorToFile(
      "frontend/staticwebapp.config.json",
      JSON.stringify({ platform: { apiRuntime: "node:22" } }, null, 2),
      22,
    ),
    null,
  );
  assert.ok(
    applyNodeMajorToFile(".github/workflows/a.yml", 'node-version: "20"\n', 22)?.includes('"22"'),
  );
  assert.ok(applyNodeMajorToFile("frontend/package.json", '{\n  "engines": { "node": ">=20" }\n}\n', 22)?.includes(">=22"));
}

{
  const plan = buildAlignPlan({
    swaDocsText: "broken",
    swaConfigJson: "{}",
    packages: [],
    workflows: [],
  });
  assert.equal(plan.targetMajor, null);
  assert.ok(plan.parseError);
  assert.deepEqual(filesToAlign(plan), []);
}

console.log("platform-versions tests passed");
