import { randomUUID } from "crypto";
import {
  COSMOS_CONTAINERS,
  getContainer,
  isCosmosConfigured,
} from "@/lib/server/cosmos";
import { sanitizeText } from "@/lib/server/security";
import {
  RELATION_CLIENT_LINK_KINDS,
  RELATION_EDGE_KINDS,
  RELATION_ORG_KINDS,
  RELATION_PERSON_STATUSES,
  type RelationAffiliation,
  type RelationClientLinkKind,
  type RelationEdge,
  type RelationEdgeKind,
  type RelationEvent,
  type RelationGroupEdge,
  type RelationMapLayout,
  type RelationOrgKind,
  type RelationPerson,
  type RelationPersonStatus,
  type RelationWorkspace,
} from "@/lib/types/work-relations";
import { currentAffiliation, relationDateKey } from "@/lib/work-relations-utils";

const MAX_FACE_PHOTO_CHARS = 140_000;

const WORKSPACE_DOC_ID = "workspace";
const MAX_PEOPLE = 250;
const MAX_EDGES = 500;
const MAX_EVENTS = 300;
const MAX_AFFILIATIONS = 40;
const MAX_GROUP_EDGES = 200;

function relationsContainer() {
  return getContainer(COSMOS_CONTAINERS.workRelations);
}

function emptyWorkspace(userId: string): RelationWorkspace {
  const now = new Date().toISOString();
  return {
    id: WORKSPACE_DOC_ID,
    userId,
    kind: "relation-workspace",
    people: [],
    edges: [],
    events: [],
    groupEdges: [],
    layout: { groupPositions: {}, personOffsets: {} },
    createdAt: now,
    updatedAt: now,
  };
}

function asOrgKind(value: unknown): RelationOrgKind {
  return RELATION_ORG_KINDS.includes(value as RelationOrgKind)
    ? (value as RelationOrgKind)
    : "other";
}

function asEdgeKind(value: unknown): RelationEdgeKind {
  return RELATION_EDGE_KINDS.includes(value as RelationEdgeKind)
    ? (value as RelationEdgeKind)
    : "other";
}

function asStatus(value: unknown): RelationPersonStatus {
  return RELATION_PERSON_STATUSES.includes(value as RelationPersonStatus)
    ? (value as RelationPersonStatus)
    : "active";
}

function asDateOrNull(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const trimmed = sanitizeText(value, 32);
  return /^\d{4}-\d{2}(-\d{2})?$/.test(trimmed) ? trimmed : null;
}

function asStrength(value: unknown): 1 | 2 | 3 {
  const n = Number(value);
  if (n === 1 || n === 2 || n === 3) return n;
  return 2;
}

function asEmail(value: unknown): string {
  const email = sanitizeText(String(value ?? ""), 120).toLowerCase();
  if (!email) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return sanitizeText(String(value ?? ""), 120);
  return email;
}

function normalizeClientLinks(value: unknown): RelationClientLinkKind[] {
  if (!Array.isArray(value)) return [];
  const links = value
    .map((item) => String(item))
    .filter((item): item is RelationClientLinkKind =>
      RELATION_CLIENT_LINK_KINDS.includes(item as RelationClientLinkKind),
    );
  return [...new Set(links)];
}

function normalizeFacePhoto(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("data:image/")) return null;
  if (value.length > MAX_FACE_PHOTO_CHARS) return null;
  if (!/^data:image\/(?:jpeg|jpg|png|webp);base64,/i.test(value)) return null;
  return value;
}

export function normalizeAffiliation(
  input: Partial<RelationAffiliation>,
  existingId?: string,
): RelationAffiliation | null {
  const orgName = sanitizeText(input.orgName ?? "", 120);
  const unitName = sanitizeText(input.unitName ?? "", 120);
  const title = sanitizeText(input.title ?? "", 120);
  const startedOn = asDateOrNull(input.startedOn);
  const endedOn = asDateOrNull(input.endedOn);
  if (
    !orgName &&
    !unitName &&
    !title &&
    !input.email &&
    !input.phone &&
    !startedOn &&
    !endedOn
  ) {
    return null;
  }

  return {
    id: existingId ?? (sanitizeText(input.id ?? "", 64) || randomUUID()),
    orgKind: asOrgKind(input.orgKind),
    orgName,
    unitName,
    title,
    email: asEmail(input.email),
    phone: sanitizeText(String(input.phone ?? ""), 40),
    startedOn,
    endedOn,
    notes: sanitizeText(input.notes ?? "", 1000),
  };
}

function syncPersonMirror(person: RelationPerson): RelationPerson {
  const current = currentAffiliation(person);
  const hasOpen = (person.affiliations ?? []).some((a) => !a.endedOn);
  const status =
    person.status === "left"
      ? "left"
      : hasOpen
        ? person.status === "transferred"
          ? "transferred"
          : "active"
        : person.affiliations.length > 0
          ? "left"
          : person.status;

  const startedKeys = person.affiliations
    .map((a) => relationDateKey(a.startedOn))
    .filter((k): k is number => k != null);
  const earliest =
    startedKeys.length > 0
      ? [...person.affiliations].sort(
          (a, b) =>
            (relationDateKey(a.startedOn) ?? Number.MAX_SAFE_INTEGER) -
            (relationDateKey(b.startedOn) ?? Number.MAX_SAFE_INTEGER),
        )[0]?.startedOn ?? null
      : person.startedOn;

  return {
    ...person,
    orgKind: current?.orgKind ?? person.orgKind,
    orgName: current?.orgName ?? person.orgName,
    title: current?.title ?? person.title,
    email: current?.email || person.email || "",
    phone: current?.phone || person.phone || "",
    startedOn: earliest,
    endedOn: hasOpen ? null : (current?.endedOn ?? person.endedOn),
    status,
  };
}

export function normalizePerson(
  input: Partial<RelationPerson> & { name?: string },
  existingId?: string,
): RelationPerson | null {
  const name = sanitizeText(input.name ?? "", 80);
  if (!name) return null;

  let affiliations = (input.affiliations ?? [])
    .slice(0, MAX_AFFILIATIONS)
    .map((item) => normalizeAffiliation(item))
    .filter((item): item is RelationAffiliation => Boolean(item));

  // Legacy rows: flat org fields only → one affiliation
  if (affiliations.length === 0) {
    const legacy = normalizeAffiliation({
      orgKind: input.orgKind,
      orgName: input.orgName,
      unitName: "",
      title: input.title,
      email: input.email,
      phone: input.phone,
      startedOn: input.startedOn,
      endedOn: input.endedOn,
      notes: "",
    });
    if (legacy) affiliations = [legacy];
  }

  const base: RelationPerson = {
    id: existingId ?? (sanitizeText(input.id ?? "", 64) || randomUUID()),
    name,
    orgKind: asOrgKind(input.orgKind),
    orgName: sanitizeText(input.orgName ?? "", 120),
    title: sanitizeText(input.title ?? "", 120),
    email: asEmail(input.email),
    phone: sanitizeText(String(input.phone ?? ""), 40),
    status: asStatus(input.status),
    startedOn: asDateOrNull(input.startedOn),
    endedOn: asDateOrNull(input.endedOn),
    affiliations,
    clientLinks: normalizeClientLinks(input.clientLinks),
    facePhotoDataUrl: normalizeFacePhoto(input.facePhotoDataUrl),
    notes: sanitizeText(input.notes ?? "", 2000),
    tags: (input.tags ?? [])
      .slice(0, 8)
      .map((tag) => sanitizeText(String(tag), 24))
      .filter(Boolean),
  };

  return syncPersonMirror(base);
}

export function normalizeEdge(
  input: Partial<RelationEdge> & {
    fromPersonId?: string;
    toPersonId?: string;
  },
  existingId?: string,
): RelationEdge | null {
  const fromPersonId = sanitizeText(input.fromPersonId ?? "", 64);
  const toPersonId = sanitizeText(input.toPersonId ?? "", 64);
  if (!fromPersonId || !toPersonId || fromPersonId === toPersonId) return null;

  return {
    id: existingId ?? (sanitizeText(input.id ?? "", 64) || randomUUID()),
    fromPersonId,
    toPersonId,
    kind: asEdgeKind(input.kind),
    label: sanitizeText(input.label ?? "", 80),
    strength: asStrength(input.strength),
    startedOn: asDateOrNull(input.startedOn),
    endedOn: asDateOrNull(input.endedOn),
    notes: sanitizeText(input.notes ?? "", 1000),
  };
}

export function normalizeEvent(
  input: Partial<RelationEvent> & { title?: string },
  existingId?: string,
): RelationEvent | null {
  const title = sanitizeText(input.title ?? "", 120);
  const occurredOn = asDateOrNull(input.occurredOn);
  if (!title || !occurredOn) return null;

  return {
    id: existingId ?? (sanitizeText(input.id ?? "", 64) || randomUUID()),
    personIds: (input.personIds ?? [])
      .slice(0, 20)
      .map((id) => sanitizeText(String(id), 64))
      .filter(Boolean),
    title,
    occurredOn,
    notes: sanitizeText(input.notes ?? "", 2000),
  };
}

function normalizeWorkspace(
  userId: string,
  input: Partial<RelationWorkspace>,
  existing?: RelationWorkspace | null,
): RelationWorkspace {
  const people = (input.people ?? [])
    .slice(0, MAX_PEOPLE)
    .map((person) => normalizePerson(person))
    .filter((person): person is RelationPerson => Boolean(person));

  const personIds = new Set(people.map((person) => person.id));

  const edges = (input.edges ?? [])
    .slice(0, MAX_EDGES)
    .map((edge) => normalizeEdge(edge))
    .filter((edge): edge is RelationEdge => Boolean(edge))
    .filter(
      (edge) =>
        personIds.has(edge.fromPersonId) && personIds.has(edge.toPersonId),
    );

  const events = (input.events ?? [])
    .slice(0, MAX_EVENTS)
    .map((event) => normalizeEvent(event))
    .filter((event): event is RelationEvent => Boolean(event))
    .map((event) => ({
      ...event,
      personIds: event.personIds.filter((id) => personIds.has(id)),
    }));

  const groupEdges = (input.groupEdges ?? existing?.groupEdges ?? [])
    .slice(0, MAX_GROUP_EDGES)
    .map((edge) => {
      const fromGroupKey = sanitizeText(String(edge.fromGroupKey ?? ""), 160);
      const toGroupKey = sanitizeText(String(edge.toGroupKey ?? ""), 160);
      if (!fromGroupKey || !toGroupKey || fromGroupKey === toGroupKey) return null;
      return {
        id: sanitizeText(String(edge.id ?? ""), 64) || randomUUID(),
        fromGroupKey,
        toGroupKey,
        label: sanitizeText(String(edge.label ?? ""), 80),
      } satisfies RelationGroupEdge;
    })
    .filter((edge): edge is RelationGroupEdge => Boolean(edge));

  const layoutInput = input.layout ?? existing?.layout;
  const layout: RelationMapLayout = {
    groupPositions: {},
    personOffsets: {},
  };
  if (layoutInput?.groupPositions && typeof layoutInput.groupPositions === "object") {
    for (const [key, value] of Object.entries(layoutInput.groupPositions).slice(0, 200)) {
      if (!value || typeof value !== "object") continue;
      const x = Number((value as { x?: number }).x);
      const y = Number((value as { y?: number }).y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      layout.groupPositions[sanitizeText(key, 160)] = {
        x: Math.max(-200, Math.min(4000, x)),
        y: Math.max(-200, Math.min(4000, y)),
      };
    }
  }
  if (layoutInput?.personOffsets && typeof layoutInput.personOffsets === "object") {
    for (const [key, value] of Object.entries(layoutInput.personOffsets).slice(0, 250)) {
      if (!value || typeof value !== "object") continue;
      const x = Number((value as { x?: number }).x);
      const y = Number((value as { y?: number }).y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      layout.personOffsets[sanitizeText(key, 64)] = {
        x: Math.max(-40, Math.min(800, x)),
        y: Math.max(-40, Math.min(800, y)),
      };
    }
  }

  const now = new Date().toISOString();
  return {
    id: WORKSPACE_DOC_ID,
    userId,
    kind: "relation-workspace",
    people,
    edges,
    events,
    groupEdges,
    layout,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export async function getRelationWorkspace(
  userId: string,
): Promise<RelationWorkspace> {
  if (!isCosmosConfigured()) return emptyWorkspace(userId);

  try {
    const { resource } = await relationsContainer()
      .item(WORKSPACE_DOC_ID, userId)
      .read<RelationWorkspace>();
    if (!resource || resource.kind !== "relation-workspace") {
      return emptyWorkspace(userId);
    }
    return normalizeWorkspace(userId, resource, resource);
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? Number((error as { code?: number }).code)
        : 0;
    if (code === 404) return emptyWorkspace(userId);
    throw error;
  }
}

export async function saveRelationWorkspace(
  userId: string,
  input: Partial<RelationWorkspace>,
): Promise<RelationWorkspace> {
  const existing = await getRelationWorkspace(userId);
  const workspace = normalizeWorkspace(userId, input, existing);
  const { resource } = await relationsContainer().items.upsert(workspace);
  return (resource as RelationWorkspace | undefined) ?? workspace;
}
