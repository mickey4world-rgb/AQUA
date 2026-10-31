// 完全架空・実在組織／人名禁止
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { sha256Hex } from "./sha256-hex";
import { ALLOWED_LOGIN_HASHES, isAllowedLogin } from "./allowed-users";
import { parseIdentityLinksSetting } from "./identity-links";
import {
  readBearerToken,
  requestHasAutomationSecret,
  secretEquals,
} from "./server/automation-auth";

for (const s of ["", "a", "abc", "サンプル", "x".repeat(55), "y".repeat(56), "z".repeat(200)]) {
  assert.equal(sha256Hex(s), createHash("sha256").update(s, "utf8").digest("hex"), `sha256 ${s.length}`);
}

for (const h of ALLOWED_LOGIN_HASHES) assert.match(h, /^[0-9a-f]{64}$/);
assert.equal(isAllowedLogin("intruder-sample"), false);
assert.equal(isAllowedLogin("someone", "someone@example.invalid"), false);

const linksJson = JSON.stringify([
  { canonicalLogin: "sample", email: "sample@example.invalid", aliases: ["sample-gh"] },
]);
assert.equal(parseIdentityLinksSetting(linksJson).length, 1);
assert.equal(
  parseIdentityLinksSetting(Buffer.from(linksJson).toString("base64"))[0]?.email,
  "sample@example.invalid",
);
assert.deepEqual(parseIdentityLinksSetting("garbage"), []);
assert.deepEqual(parseIdentityLinksSetting(undefined), []);

assert.equal(secretEquals("abc", "abc"), true);
assert.equal(secretEquals("abc", "abd"), false);
assert.equal(secretEquals("abc", "abcd"), false);
assert.equal(secretEquals("", ""), false, "空の秘密は常に不一致");
assert.equal(secretEquals("abc", undefined), false);

function req(headers: Record<string, string>): Request {
  return new Request("https://example.invalid/api", { method: "POST", headers });
}
assert.equal(readBearerToken(req({ authorization: "Bearer tok" })), "tok");
assert.equal(readBearerToken(req({ authorization: "bearer tok" })), "tok");
assert.equal(readBearerToken(req({ authorization: "Basic tok" })), null);

assert.equal(requestHasAutomationSecret(req({ authorization: "Bearer s1" }), ["s1"]), true);
assert.equal(requestHasAutomationSecret(req({ authorization: "Bearer s2" }), ["s1"]), false);
assert.equal(requestHasAutomationSecret(req({ authorization: "Bearer s1" }), [undefined]), false, "未設定は拒否");
assert.equal(requestHasAutomationSecret(req({}), ["s1"]), false);
assert.equal(
  requestHasAutomationSecret(req({ "x-alt": "s1" }), ["s1"], ["x-alt"]),
  true,
  "代替ヘッダー",
);
assert.equal(
  requestHasAutomationSecret(req({ "x-alt": "s1" }), ["s1"]),
  false,
  "代替ヘッダーは明示時のみ",
);
assert.equal(
  requestHasAutomationSecret(req({ authorization: "Bearer s2" }), ["s1", "s2"]),
  true,
  "複数秘密のどれか",
);

console.log("security-hardening.test.ts: ok");
