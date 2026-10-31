/**
 * 複数 IdP（Microsoft / GitHub）を同一アプリユーザーへ束ねる定義。
 * SWA の principal.userId はプロバイダごとに異なるため、メール／ログイン名で正規化する。
 * 実メールを公開リポジトリに置かないため、サーバー側のアプリ設定
 * AQUA_IDENTITY_LINKS_JSON（JSON 配列、または その base64）から読む。
 */
export type LinkedIdentity = {
  /** 許可リスト上の正規ログイン名 */
  canonicalLogin: string;
  /** 正規メール（Cosmos 上の既存プロファイル検索キー） */
  email: string;
  /** 別名: GitHub ハンドル・別メール・表示名など（小文字比較） */
  aliases: string[];
};

function isLinkedIdentity(value: unknown): value is LinkedIdentity {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.canonicalLogin === "string" &&
    typeof v.email === "string" &&
    Array.isArray(v.aliases) &&
    v.aliases.every((a) => typeof a === "string")
  );
}

function decodeSetting(text: string): string {
  if (text.startsWith("[")) return text;
  if (typeof Buffer !== "undefined") return Buffer.from(text, "base64").toString("utf8");
  return new TextDecoder().decode(Uint8Array.from(atob(text), (c) => c.charCodeAt(0)));
}

export function parseIdentityLinksSetting(
  raw: string | undefined | null,
): LinkedIdentity[] {
  const text = raw?.trim();
  if (!text) return [];
  try {
    const parsed: unknown = JSON.parse(decodeSetting(text));
    return Array.isArray(parsed) ? parsed.filter(isLinkedIdentity) : [];
  } catch {
    return [];
  }
}

let cached: { raw: string | undefined; links: LinkedIdentity[] } | null = null;

/** ブラウザでは環境変数が無いので常に空（照合はサーバー側で行う） */
export function getLinkedIdentities(): LinkedIdentity[] {
  const raw =
    typeof process !== "undefined" ? process.env?.AQUA_IDENTITY_LINKS_JSON : undefined;
  if (cached && cached.raw === raw) return cached.links;
  cached = { raw, links: parseIdentityLinksSetting(raw) };
  return cached.links;
}

export function findLinkedIdentity(
  ...candidates: Array<string | undefined | null>
): LinkedIdentity | null {
  const normalized = candidates
    .filter((value): value is string => Boolean(value && value.trim()))
    .map((value) => value.trim().toLowerCase());

  for (const identity of getLinkedIdentities()) {
    const keys = new Set([
      identity.canonicalLogin.toLowerCase(),
      identity.email.toLowerCase(),
      identity.email.split("@")[0]?.toLowerCase() ?? "",
      ...identity.aliases.map((alias) => alias.toLowerCase()),
    ]);
    if (normalized.some((candidate) => keys.has(candidate))) {
      return identity;
    }
  }
  return null;
}
