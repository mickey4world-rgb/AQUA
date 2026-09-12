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

/** 相関図・凡例で共通利用する色（均一） */
export const RELATION_ORG_COLORS: Record<RelationOrgKind, string> = {
  supreme_court: "#7dd3fc",
  cabinet: "#5eead4",
  vendor: "#fcd34d",
  other: "#c4b5fd",
};

/** 組織枠も要員と同じ従来パレット（どぎつい別色は使わない） */
export const RELATION_GROUP_BOX_COLORS: Record<RelationOrgKind, string> = {
  ...RELATION_ORG_COLORS,
};

/** 組織枠のごく薄い塗り */
export const RELATION_GROUP_BOX_FILLS: Record<RelationOrgKind, string> = {
  supreme_court: "rgba(125, 211, 252, 0.07)",
  cabinet: "rgba(94, 234, 212, 0.07)",
  vendor: "rgba(252, 211, 77, 0.07)",
  other: "rgba(196, 181, 253, 0.07)",
};

/** 業者が取引・関連する官庁 */
export const RELATION_CLIENT_LINK_KINDS = [
  "supreme_court",
  "cabinet",
] as const;

export type RelationClientLinkKind =
  (typeof RELATION_CLIENT_LINK_KINDS)[number];

export const RELATION_CLIENT_LINK_LABELS: Record<
  RelationClientLinkKind,
  string
> = {
  supreme_court: "最高裁判所関連",
  cabinet: "内閣官房関連",
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

/** ある期間の所属（異動履歴の1行） */
export type RelationAffiliation = {
  id: string;
  orgKind: RelationOrgKind;
  /** 組織名（例: 最高裁判所 / ○○株式会社） */
  orgName: string;
  /** 部署・室・チームなど */
  unitName: string;
  title: string;
  email: string;
  phone: string;
  /** 在籍開始（YYYY-MM または YYYY-MM-DD） */
  startedOn: string | null;
  /** 在籍終了。空/null = 現在在籍中 */
  endedOn: string | null;
  notes: string;
};

export type RelationPerson = {
  id: string;
  name: string;
  /** 現時点（または最新）所属のミラー。相関図色分け用 */
  orgKind: RelationOrgKind;
  orgName: string;
  title: string;
  email: string;
  phone: string;
  status: RelationPersonStatus;
  startedOn: string | null;
  endedOn: string | null;
  affiliations: RelationAffiliation[];
  /**
   * 業者が最高裁・内閣官房のどちら（または両方）に関連するか。
   * 官庁職員本人には通常使わない。
   */
  clientLinks: RelationClientLinkKind[];
  /** 顔写真（JPEG data URL、正方形クロップ） */
  facePhotoDataUrl: string | null;
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

/** 組織枠どうしの関係線 */
export type RelationGroupEdge = {
  id: string;
  fromGroupKey: string;
  toGroupKey: string;
  label: string;
};

/** マウス編集で動かした位置（永続化） */
export type RelationMapLayout = {
  groupPositions: Record<string, { x: number; y: number }>;
  /** 組織枠内の相対座標 */
  personOffsets: Record<string, { x: number; y: number }>;
};

export type RelationWorkspace = {
  id: string;
  userId: string;
  kind: "relation-workspace";
  people: RelationPerson[];
  edges: RelationEdge[];
  events: RelationEvent[];
  groupEdges: RelationGroupEdge[];
  layout: RelationMapLayout;
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

export type RelationCardScanResult = {
  name: string;
  orgKind: RelationOrgKind;
  orgName: string;
  unitName: string;
  title: string;
  email: string;
  phone: string;
  notes: string;
  confidence: "high" | "medium" | "low";
};
