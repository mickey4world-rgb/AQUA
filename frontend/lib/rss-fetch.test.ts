/**
 * Run: npx --yes tsx lib/rss-fetch.test.ts
 */
import assert from "node:assert/strict";
import { fetchRssXml } from "./server/rss-fetch";

const originalFetch = globalThis.fetch;

async function withMockFetch(
  impl: typeof fetch,
  run: () => Promise<void>,
): Promise<void> {
  globalThis.fetch = impl;
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function main() {
  await withMockFetch(
    async () => new Response("<rss><channel></channel></rss>", { status: 200 }),
    async () => {
      const result = await fetchRssXml("https://example.com/feed.xml", {
        maxAttempts: 1,
        timeoutMs: 2000,
      });
      assert.equal(result.ok, true);
      if (result.ok) assert.match(result.xml, /<rss>/);
    },
  );

  {
    let calls = 0;
    await withMockFetch(
      async () => {
        calls += 1;
        if (calls === 1) return new Response("busy", { status: 503 });
        return new Response("<rss><channel></channel></rss>", { status: 200 });
      },
      async () => {
        const result = await fetchRssXml("https://example.com/feed.xml", {
          maxAttempts: 3,
          timeoutMs: 2000,
        });
        assert.equal(result.ok, true);
        assert.equal(calls, 2);
      },
    );
  }

  {
    let calls = 0;
    await withMockFetch(
      async () => {
        calls += 1;
        return new Response("busy", { status: 503 });
      },
      async () => {
        const result = await fetchRssXml("https://example.com/feed.xml", {
          maxAttempts: 2,
          timeoutMs: 2000,
        });
        assert.equal(result.ok, false);
        if (!result.ok) {
          assert.equal(result.reason, "RSS HTTP 503");
          assert.equal(result.status, 503);
        }
        assert.equal(calls, 2);
      },
    );
  }

  console.log("rss-fetch.test.ts: ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
