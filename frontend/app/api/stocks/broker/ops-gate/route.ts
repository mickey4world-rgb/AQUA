import { withApiAccessLog } from "@/lib/server/api-access";
import {
  createOpsUnlockCookieValue,
  isOpsPinConfigured,
  opsLockCookieHeader,
  opsUnlockCookieHeader,
  readOpsUnlockFromCookie,
  setOpsPin,
  verifyOpsPin,
} from "@/lib/server/stock-ops-pin";

export const dynamic = "force-dynamic";

/** 外出確認 PIN の状態 */
export async function GET(request: Request) {
  return withApiAccessLog(request, async (auth) => {
    const configured = await isOpsPinConfigured(auth.userId);
    const unlocked = readOpsUnlockFromCookie(
      request.headers.get("cookie"),
      auth.userId,
    );
    return Response.json({
      configured,
      unlocked,
      hint: configured
        ? "外出確認 PIN を入力すると株ステーション状態の詳細が見られます"
        : "先に 6〜12 桁の数字 PIN を設定してください（携帯のロックと併用）",
    });
  });
}

/** PIN 設定 / 解除 / ロック */
export async function POST(request: Request) {
  return withApiAccessLog(request, async (auth) => {
    let body: { action?: string; pin?: string } = {};
    try {
      body = (await request.json()) as { action?: string; pin?: string };
    } catch {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const action = body.action ?? "unlock";

    if (action === "lock") {
      return new Response(JSON.stringify({ ok: true, unlocked: false }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": opsLockCookieHeader(),
        },
      });
    }

    if (action === "set") {
      try {
        await setOpsPin(auth.userId, String(body.pin ?? ""));
      } catch (error) {
        return Response.json(
          {
            error:
              error instanceof Error ? error.message : "PIN 設定に失敗しました",
          },
          { status: 400 },
        );
      }
      const cookie = createOpsUnlockCookieValue(auth.userId);
      return new Response(
        JSON.stringify({ ok: true, configured: true, unlocked: true }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": opsUnlockCookieHeader(cookie.value, cookie.maxAge),
          },
        },
      );
    }

    // unlock
    const configured = await isOpsPinConfigured(auth.userId);
    if (!configured) {
      return Response.json(
        { error: "先に PIN を設定してください", configured: false },
        { status: 400 },
      );
    }
    const ok = await verifyOpsPin(auth.userId, String(body.pin ?? ""));
    if (!ok) {
      return Response.json({ error: "PIN が違います", unlocked: false }, {
        status: 401,
      });
    }
    const cookie = createOpsUnlockCookieValue(auth.userId);
    return new Response(JSON.stringify({ ok: true, unlocked: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": opsUnlockCookieHeader(cookie.value, cookie.maxAge),
      },
    });
  });
}
