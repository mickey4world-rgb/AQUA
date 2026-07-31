export const ALLOWED_LOGIN_NAMES = [
  "aquaiot",
  "aya_tink",
  "guest_free77",
] as const;

const ALLOWED_SET = new Set(
  ALLOWED_LOGIN_NAMES.map((name) => name.toLowerCase()),
);

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

  return [...candidates];
}

export function isAllowedLogin(userDetails: string, email?: string): boolean {
  return collectLoginCandidates(userDetails, email).some((candidate) =>
    ALLOWED_SET.has(candidate),
  );
}
