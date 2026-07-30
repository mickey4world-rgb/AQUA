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
      jsonBody: { roles: principal.userRoles ?? ["authenticated"] },
    };
  },
});
