import type {
  RelationAffiliation,
  RelationEdge,
  RelationOrgKind,
  RelationPerson,
} from "@/lib/types/work-relations";

/** YYYY-MM or YYYY-MM-DD → comparable day key (YYYYMMDD number) */
export function relationDateKey(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = value.trim().match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = m[3] ? Number(m[3]) : 1;
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return y * 10000 + mo * 100 + d;
}

export function isPeriodActiveAt(
  startedOn: string | null | undefined,
  endedOn: string | null | undefined,
  asOf: string | null,
): boolean {
  if (!asOf) return true;
  const asOfKey = relationDateKey(asOf);
  if (asOfKey == null) return true;

  const startKey = relationDateKey(startedOn);
  const endKey = relationDateKey(endedOn);
  if (startKey != null && asOfKey < startKey) return false;
  if (endKey != null && asOfKey > endKey) return false;
  return true;
}

/** 現在所属 = endedOn なし。なければ開始日が最も新しいもの */
export function currentAffiliation(
  person: Pick<RelationPerson, "affiliations">,
): RelationAffiliation | null {
  const list = person.affiliations ?? [];
  if (list.length === 0) return null;
  const open = list.filter((a) => !a.endedOn);
  if (open.length > 0) {
    return [...open].sort(
      (a, b) => (relationDateKey(b.startedOn) ?? 0) - (relationDateKey(a.startedOn) ?? 0),
    )[0];
  }
  return [...list].sort(
    (a, b) => (relationDateKey(b.startedOn) ?? 0) - (relationDateKey(a.startedOn) ?? 0),
  )[0];
}

export function affiliationAt(
  person: Pick<RelationPerson, "affiliations" | "orgKind" | "orgName" | "title" | "email" | "phone">,
  asOf: string | null,
): RelationAffiliation | null {
  const list = person.affiliations ?? [];
  if (list.length === 0) {
    return {
      id: "legacy",
      orgKind: person.orgKind,
      orgName: person.orgName,
      unitName: "",
      title: person.title,
      email: person.email ?? "",
      phone: person.phone ?? "",
      startedOn: null,
      endedOn: null,
      notes: "",
    };
  }
  if (!asOf) return currentAffiliation(person);

  const active = list.filter((a) =>
    isPeriodActiveAt(a.startedOn, a.endedOn, asOf),
  );
  if (active.length === 0) return null;
  return [...active].sort(
    (a, b) => (relationDateKey(b.startedOn) ?? 0) - (relationDateKey(a.startedOn) ?? 0),
  )[0];
}

export function personVisibleAt(
  person: RelationPerson,
  mode: "all" | "asOf",
  asOf: string | null,
): boolean {
  if (mode === "all") return true;
  if (!asOf) return true;
  return affiliationAt(person, asOf) != null;
}

export function edgeVisibleAt(
  edge: RelationEdge,
  mode: "all" | "asOf",
  asOf: string | null,
): boolean {
  if (mode === "all") return true;
  return isPeriodActiveAt(edge.startedOn, edge.endedOn, asOf);
}

export function displayOrgKind(
  person: RelationPerson,
  mode: "all" | "asOf",
  asOf: string | null,
): RelationOrgKind {
  if (mode === "asOf" && asOf) {
    return affiliationAt(person, asOf)?.orgKind ?? person.orgKind;
  }
  return currentAffiliation(person)?.orgKind ?? person.orgKind;
}

export function displayOrgLabel(
  person: RelationPerson,
  mode: "all" | "asOf",
  asOf: string | null,
): string {
  const aff =
    mode === "asOf" && asOf
      ? affiliationAt(person, asOf)
      : currentAffiliation(person);
  if (!aff) return person.orgName || "所属不明";
  return [aff.orgName, aff.unitName].filter(Boolean).join(" / ") || "所属不明";
}

export function emptyAffiliation(
  partial?: Partial<RelationAffiliation>,
): RelationAffiliation {
  return {
    id: partial?.id ?? crypto.randomUUID(),
    orgKind: partial?.orgKind ?? "other",
    orgName: partial?.orgName ?? "",
    unitName: partial?.unitName ?? "",
    title: partial?.title ?? "",
    email: partial?.email ?? "",
    phone: partial?.phone ?? "",
    startedOn: partial?.startedOn ?? null,
    endedOn: partial?.endedOn ?? null,
    notes: partial?.notes ?? "",
  };
}
