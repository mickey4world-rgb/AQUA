import { withApiAccessLog } from "@/lib/server/api-access";
import { isCosmosConfigured } from "@/lib/server/cosmos";
import { getUserById, syncUser, updateUser } from "@/lib/server/users";
import type { UpdateUserRequest } from "@/lib/types/user";

export async function GET(request: Request) {
  if (!isCosmosConfigured()) {
    return Response.json(
      { error: "ServiceUnavailable", message: "Cosmos DB が未設定です" },
      { status: 503 },
    );
  }

  return withApiAccessLog(request, async (auth) => {
    const user = await getUserById(auth.userId);
    if (!user) {
      return Response.json(
        { error: "NotFound", message: "ユーザーが登録されていません" },
        { status: 404 },
      );
    }

    return Response.json(user);
  });
}

export async function PATCH(request: Request) {
  if (!isCosmosConfigured()) {
    return Response.json(
      { error: "ServiceUnavailable", message: "Cosmos DB が未設定です" },
      { status: 503 },
    );
  }

  return withApiAccessLog(request, async (auth) => {
    const body = (await request.json()) as UpdateUserRequest;
    const updates: UpdateUserRequest = {};

    if (typeof body.displayName === "string" && body.displayName.trim()) {
      updates.displayName = body.displayName.trim();
    }
    if (typeof body.notifyEmail === "string" && body.notifyEmail.includes("@")) {
      updates.notifyEmail = body.notifyEmail.trim();
    }

    if (Object.keys(updates).length === 0) {
      return Response.json(
        { error: "BadRequest", message: "更新項目がありません" },
        { status: 400 },
      );
    }

    const user = await updateUser(auth.userId, updates);
    if (!user) {
      return Response.json(
        { error: "NotFound", message: "ユーザーが見つかりません" },
        { status: 404 },
      );
    }

    return Response.json(user);
  });
}

export async function POST(request: Request) {
  if (!isCosmosConfigured()) {
    return Response.json(
      { error: "ServiceUnavailable", message: "Cosmos DB が未設定です" },
      { status: 503 },
    );
  }

  return withApiAccessLog(request, async (auth) => {
    const user = await syncUser(auth);
    return Response.json(user);
  });
}
