import { withApiAccessLog } from "@/lib/server/api-access";
import { findAsteroidImage } from "@/lib/server/nasa-neo";

export async function GET(request: Request) {
  return withApiAccessLog(request, async () => {
    const { searchParams } = new URL(request.url);
    const des = searchParams.get("des")?.trim() ?? "";
    const name = searchParams.get("name")?.trim() ?? "";
    if (!des && !name) {
      return Response.json({ error: "des or name required" }, { status: 400 });
    }

    const primary = await findAsteroidImage(des || name);
    if (primary.url) {
      return Response.json({ url: primary.url, credit: primary.credit });
    }

    if (name && name !== des) {
      const secondary = await findAsteroidImage(name);
      return Response.json({
        url: secondary.url ?? null,
        credit: secondary.credit ?? null,
      });
    }

    return Response.json({ url: null, credit: null });
  });
}
