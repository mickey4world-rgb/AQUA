import { findLinkedIdentity } from "@/lib/identity-links";
import { sha256Hex } from "@/lib/sha256-hex";

/**
 * 許可ログイン名（小文字）の SHA-256。公開リポジトリに実ログイン名を置かないためハッシュで持つ。
 * 追加: `node -e "console.log(require('crypto').createHash('sha256').update('<login>'.toLowerCase()).digest('hex'))"`
 */
export const ALLOWED_LOGIN_HASHES: readonly string[] = [
  "b48f4fd2bee7c4fda4cad96a387a85624acbe299145ac32e0e73686c685dad46",
  "b1f19fcb1b3032b807f79c31573e15d1314f06c158181c9a7384ed77fb50047e",
  "d231c69b75ebf08dd5239af4e0abb2f6c1886bd797de5607d0ee440eb175520a",
  // GitHub ログイン（Microsoft アカウントと同一人物）
  "3ddaf27740faa440baf5017ec8ae99fc15da3649236ce4423757a7238581e778",
];

const ALLOWED_SET = new Set(ALLOWED_LOGIN_HASHES);

export function normalizeLoginName(value: string): string {
  return value.trim().toLowerCase();
}

export function collectLoginCandidates(
  userDetails: string,
  email?: string,
): string[] {
  const candidates = new Set<string>();
  const details = normalizeLoginName(userDetails);
  candidates.add(details);

  if (details.includes("@")) {
    candidates.add(details.split("@")[0] ?? details);
  }

  if (email) {
    const normalizedEmail = normalizeLoginName(email);
    candidates.add(normalizedEmail);
    candidates.add(normalizedEmail.split("@")[0] ?? normalizedEmail);
  }

  const linked = findLinkedIdentity(...candidates, userDetails, email);
  if (linked) {
    candidates.add(normalizeLoginName(linked.canonicalLogin));
    candidates.add(normalizeLoginName(linked.email));
    candidates.add(normalizeLoginName(linked.email.split("@")[0] ?? ""));
    for (const alias of linked.aliases) {
      candidates.add(normalizeLoginName(alias));
    }
  }

  return [...candidates].filter(Boolean);
}

export function isAllowedLogin(userDetails: string, email?: string): boolean {
  return collectLoginCandidates(userDetails, email).some((candidate) =>
    ALLOWED_SET.has(sha256Hex(candidate)),
  );
}
