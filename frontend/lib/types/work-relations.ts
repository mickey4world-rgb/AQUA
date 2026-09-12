export const RELATION_ORG_KINDS = [
  "supreme_court",
  "cabinet",
  "vendor",
  "other",
] as const;

export type RelationOrgKind = (typeof RELATION_ORG_KINDS)[number];

export const RELATION_ORG_LABELS: Record<RelationOrgKind, string> = {
  supreme_court: "最高裁判所",
  cabinet: "内閣官房",
  vendor: "関連業者",
  other: "その他",
};

export const RELATION_EDGE_KINDS = [
  "reports_to",
  "peer",
  "introducer",
  "vendor_contact",
  "meeting",
  "project",
  "other",
] as const;

export type RelationEdgeKind = (typeof RELATION_EDGE_KINDS)[number];

export const RELATION_EDGE_LABELS: Record<RelationEdgeKind, string> = {
  reports_to: "上下関係",
  peer: "同僚・同席",
  introducer: "紹介",
  vendor_contact: "業者窓口",
  meeting: "打合せ",
  project: "案件メンバー",
  other: "その他",
};

export const RELATION_PERSON_STATUSES = [
  "active",
  "transferred",
  "left",
] as const;

export type RelationPersonStatus = (typeof RELATION_PERSON_STATUSES)[number];

export const RELATION_PERSON_STATUS_LABELS: Record<RelationPersonStatus, string> =
  {
    active: "在任",
    transferred: "異動",
    left: "離任",
  };

export type RelationPerson = {
  id: string;
  name: string;
  orgKind: RelationOrgKind;
  orgName: string;
  title: string;
  status: RelationPersonStatus;
  startedOn: string | null;
  endedOn: string | null;
  notes: string;
  tags: string[];
};

export type RelationEdge = {
  id: string;
  fromPersonId: string;
  toPersonId: string;
  kind: RelationEdgeKind;
  label: string;
  strength: 1 | 2 | 3;
  startedOn: string | null;
  endedOn: string | null;
  notes: string;
};

export type RelationEvent = {
  id: string;
  personIds: string[];
  title: string;
  occurredOn: string;
  notes: string;
};

export type RelationWorkspace = {
  id: string;
  userId: string;
  kind: "relation-workspace";
  people: RelationPerson[];
  edges: RelationEdge[];
  events: RelationEvent[];
  createdAt: string;
  updatedAt: string;
};

export type RelationMemoParseResult = {
  people: Array<Omit<RelationPerson, "id">>;
  edges: Array<{
    fromName: string;
    toName: string;
    kind: RelationEdgeKind;
    label: string;
    strength: 1 | 2 | 3;
    notes: string;
  }>;
  events: Array<Omit<RelationEvent, "id" | "personIds"> & { personNames: string[] }>;
  summary: string;
};
