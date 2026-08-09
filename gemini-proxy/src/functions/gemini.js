const { app } = require("@azure/functions");

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const UPSTREAM_TIMEOUT_MS = 50_000;

app.http("gemini", {
  route: "gemini",
  methods: ["POST"],
  authLevel: "function",
  handler: async (request, context) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return json(500, {
        error: { message: "GEMINI_API_KEY is not configured on the relay." },
      });
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return json(400, { error: { message: "Request body must be JSON." } });
    }

    const model = typeof payload?.model === "string" ? payload.model.trim() : "";
    const body = payload?.body;
    if (!model || !body || typeof body !== "object") {
      return json(400, {
        error: { message: "Both 'model' and 'body' are required." },
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

    try {
      const upstream = await fetch(
        `${API_BASE}/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          signal: controller.signal,
          body: JSON.stringify(body),
        },
      );

      // Pass the upstream status and payload through untouched so the caller can
      // keep its own error handling for quota, key and truncation cases.
      const text = await upstream.text();
      return {
        status: upstream.status,
        headers: { "Content-Type": "application/json" },
        body: text || "{}",
      };
    } catch (error) {
      const aborted = error?.name === "AbortError";
      context.error("Gemini relay failed", error);
      return json(aborted ? 504 : 502, {
        error: {
          message: aborted
            ? "Gemini relay timed out."
            : `Gemini relay could not reach the API: ${error?.message ?? "unknown error"}`,
        },
      });
    } finally {
      clearTimeout(timeout);
    }
  },
});

function json(status, payload) {
  return {
    status,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  };
}
