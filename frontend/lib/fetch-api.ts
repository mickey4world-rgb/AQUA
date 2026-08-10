type ApiErrorBody = {
  error?: string;
};

export async function readApiJson<T>(
  res: Response,
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const text = await res.text();

  if (!text) {
    if (res.status === 502 || res.status === 504) {
      return {
        ok: false,
        error:
          "サーバー処理がタイムアウトしました。簡潔モードで再試行するか、少し待ってからお試しください。",
      };
    }
    return {
      ok: false,
      error: `サーバーから応答がありません (${res.status})`,
    };
  }

  let data: T | ApiErrorBody;
  try {
    data = JSON.parse(text) as T;
  } catch {
    if (res.status === 502 || res.status === 504) {
      return {
        ok: false,
        error:
          "サーバー処理がタイムアウトしました。簡潔モードで再試行するか、少し待ってからお試しください。",
      };
    }
    return {
      ok: false,
      error: `サーバーエラー (${res.status})`,
    };
  }

  if (!res.ok) {
    const message =
      typeof data === "object" && data && "error" in data && typeof data.error === "string"
        ? data.error
        : `リクエストに失敗しました (${res.status})`;
    return { ok: false, error: message };
  }

  return { ok: true, data: data as T };
}
