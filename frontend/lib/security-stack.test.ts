/**
 * Run: npx --yes tsx lib/security-stack.test.ts
 */
import assert from "node:assert/strict";
import {
  buildSecurityStackInventory,
  stackComponentsForLayer,
} from "./security-stack";

const inv = buildSecurityStackInventory(new Date("2026-11-23T01:00:00.000Z"));
assert.ok(inv.summary.includes("Next.js"));
assert.ok(inv.nodeMajor === 22 || inv.nodeMajor == null || inv.nodeMajor >= 20);

const app = stackComponentsForLayer(inv, "app");
const next = app.find((c) => c.name === "Next.js");
assert.ok(next?.inUse === true);
assert.ok(next?.version);

const hono = app.find((c) => c.name === "Hono");
assert.ok(hono);
assert.equal(hono!.inUse, false);
assert.ok(hono!.kind === "transitive" || hono!.kind === "not_used");

const express = app.find((c) => c.name === "Express");
assert.equal(express?.inUse, false);

assert.ok(inv.clarifications.some((c) => /Hono/.test(c)));
assert.ok(inv.clarifications.some((c) => /Next\.js/.test(c)));

console.log("security-stack.test.ts: ok");
