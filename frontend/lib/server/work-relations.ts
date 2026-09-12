import { randomUUID } from "crypto";
import {
  COSMOS_CONTAINERS,
  getContainer,
  isCosmosConfigured,
} from "@/lib/server/cosmos";
import { sanitizeText } from "@/lib/server/security";
import {
  RELATION_EDGE_KINDS,
  RELATION_ORG_KINDS,
  RELATION_PERSON_STATUSES,
  type RelationEdge,
  type RelationEdgeKind,
  type RelationEvent,
  type RelationOrgKind,
  type RelationPerson,
  type RelationPersonStatus,
  type RelationWorkspace,
} from "@/lib/types/work-relations";

const WORKSPACE_DOC_ID = "workspace";
const MAX_PEOPLE = 250;
const MAX_EDGES = 500;
const MAX_EVENTS = 300;

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

export function normalizePerson(
  input: Partial<RelationPerson> & { name?: string },
  existingId?: string,
): RelationPerson | null {
  const name = sanitizeText(input.name ?? "", 80);
  if (!name) return null;

  return {
    id: existingId ?? (sanitizeText(input.id ?? "", 64) || randomUUID()),
    name,
    orgKind: asOrgKind(input.orgKind),
    orgName: sanitizeText(input.orgName ?? "", 120),
    title: sanitizeText(input.title ?? "", 120),
    status: asStatus(input.status),
    startedOn: asDateOrNull(input.startedOn),
    endedOn: asDateOrNull(input.endedOn),
    notes: sanitizeText(input.notes ?? "", 2000),
    tags: (input.tags ?? [])
      .slice(0, 8)
      .map((tag) => sanitizeText(String(tag), 24))
      .filter(Boolean),
  };
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

  const now = new Date().toISOString();
  return {
    id: WORKSPACE_DOC_ID,
    userId,
    kind: "relation-workspace",
    people,
    edges,
    events,
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
