const { app } = require("@azure/functions");

function parseClientPrincipal(request) {
  const header = request.headers.get("x-ms-client-principal");
  if (!header) return null;
  try {
    return JSON.parse(Buffer.from(header, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

const ALLOWED_LOGIN_NAMES = new Set(["aquaiot", "aya_tink", "guest_free77"]);

function normalizeLoginName(value) {
  return value.trim().toLowerCase();
}

function collectLoginCandidates(userDetails, email) {
  const candidates = new Set();
  const details = normalizeLoginName(userDetails);
  candidates.add(details);
  if (details.includes("@")) {
    candidates.add(details.split("@")[0]);
  }
  if (email) {
    const normalizedEmail = normalizeLoginName(email);
    candidates.add(normalizedEmail);
    candidates.add(normalizedEmail.split("@")[0]);
  }
  return [...candidates];
}

function isAllowedLogin(userDetails, email) {
  return collectLoginCandidates(userDetails, email).some((candidate) =>
    ALLOWED_LOGIN_NAMES.has(candidate),
  );
}

function emailFromPrincipal(principal) {
  const emailClaim = principal.claims?.find(
    (c) => c.typ === "emails" || c.typ.includes("email"),
  );
  if (emailClaim?.val) return emailClaim.val;
  if (principal.userDetails.includes("@")) return principal.userDetails;
  return undefined;
}

function resolveRoles(principal) {
  if (!principal) return [];
  const email = emailFromPrincipal(principal);
  if (!isAllowedLogin(principal.userDetails, email)) return [];
  return ["authenticated"];
}

app.http("GetUserProfile", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "user/profile",
  handler: async (request) => {
    const principal = parseClientPrincipal(request);
    if (!principal) {
      return {
        status: 401,
        jsonBody: { error: "Unauthorized", message: "ログインが必要です" },
      };
    }

    return {
      status: 200,
      jsonBody: {
        userId: principal.userId,
        userDetails: principal.userDetails,
        identityProvider: principal.identityProvider,
        userRoles: principal.userRoles ?? [],
      },
    };
  },
});

app.http("GetRoles", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "GetRoles",
  handler: async (request) => {
    const principal = parseClientPrincipal(request);
    if (!principal) {
      return { status: 200, jsonBody: { roles: [] } };
    }
    return {
      status: 200,
      jsonBody: { roles: resolveRoles(principal) },
    };
  },
});
