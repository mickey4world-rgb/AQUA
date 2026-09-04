/**
 * 複数 IdP（Microsoft / GitHub）を同一アプリユーザーへ束ねる定義。
 * SWA の principal.userId はプロバイダごとに異なるため、メール／ログイン名で正規化する。
 */
export type LinkedIdentity = {
  /** ALLOWED_LOGIN_NAMES 上の正規ログイン名 */
  canonicalLogin: string;
  /** 正規メール（Cosmos 上の既存プロファイル検索キー） */
  email: string;
  /** 別名: GitHub ハンドル・別メール・表示名など（小文字比較） */
  aliases: string[];
};

export const LINKED_IDENTITIES: LinkedIdentity[] = [
  {
    canonicalLogin: "aquaiot",
    email: "aquaiot@outlook.com",
    aliases: [
      "aquaiot",
      "aquaiot@outlook.com",
      // GitHub: mickey4world-rgb ≡ Microsoft aquaiot@outlook.com
      "mickey4world-rgb",
    ],
  },
];

export function findLinkedIdentity(
  ...candidates: Array<string | undefined | null>
): LinkedIdentity | null {
  const normalized = candidates
    .filter((value): value is string => Boolean(value && value.trim()))
    .map((value) => value.trim().toLowerCase());

  for (const identity of LINKED_IDENTITIES) {
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
