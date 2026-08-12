import { randomBytes, randomUUID } from "crypto";
import { COSMOS_CONTAINERS, getContainer, isCosmosConfigured } from "@/lib/server/cosmos";
import type {
  SolunaMemory,
  SolunaMessage,
  SolunaProfile,
} from "@/lib/types/soluna";

const PROFILE_DOC_ID = "profile";
const MAX_MESSAGES = 40;
const MAX_MEMORIES_PER_CHARACTER = 24;

function recordsContainer() {
  return getContainer(COSMOS_CONTAINERS.solunaRecords);
}

function tokensContainer() {
  return getContainer(COSMOS_CONTAINERS.solunaTokens);
}

export function isSolunaStorageConfigured(): boolean {
  return isCosmosConfigured();
}

function defaultProfile(userId: string): SolunaProfile {
  const now = new Date().toISOString();
  return {
    id: PROFILE_DOC_ID,
    userId,
    solIntimacy: 0,
    lunaIntimacy: 0,
    solInteractions: 0,
    lunaInteractions: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export async function getOrCreateProfile(userId: string): Promise<SolunaProfile> {
  const container = recordsContainer();
  try {
    const { resource } = await container.item(PROFILE_DOC_ID, userId).read<SolunaProfile>();
    if (resource) return resource;
  } catch {
    /* create below */
  }

  const profile = defaultProfile(userId);
  await container.items.create(profile);
  return profile;
}

export async function saveProfile(profile: SolunaProfile): Promise<SolunaProfile> {
  const updated = { ...profile, updatedAt: new Date().toISOString() };
  await recordsContainer().items.upsert(updated);
  return updated;
}

export async function listMemories(userId: string, character?: "sol" | "luna"): Promise<SolunaMemory[]> {
  const query =
    character != null
      ? {
          query:
            "SELECT * FROM c WHERE c.userId = @userId AND c.docType = 'memory' AND c.character = @character ORDER BY c.createdAt DESC",
          parameters: [
            { name: "@userId", value: userId },
            { name: "@character", value: character },
          ],
        }
      : {
          query:
            "SELECT * FROM c WHERE c.userId = @userId AND c.docType = 'memory' ORDER BY c.createdAt DESC",
          parameters: [{ name: "@userId", value: userId }],
        };

  const { resources } = await recordsContainer().items
    .query<SolunaMemory & { docType: string }>(query)
    .fetchAll();

  return resources.map(({ docType: _docType, ...memory }) => memory);
}

export async function upsertMemories(userId: string, memories: SolunaMemory[]): Promise<void> {
  if (memories.length === 0) return;
  const container = recordsContainer();
  for (const memory of memories) {
    await container.items.upsert({ ...memory, docType: "memory" });
  }

  const existing = await listMemories(userId);
  const grouped = {
    sol: existing.filter((m) => m.character === "sol"),
    luna: existing.filter((m) => m.character === "luna"),
  };

  for (const character of ["sol", "luna"] as const) {
    const overflow = grouped[character].slice(MAX_MEMORIES_PER_CHARACTER);
    for (const stale of overflow) {
      await container.item(stale.id, userId).delete();
    }
  }
}

export async function listMessages(userId: string, limit = MAX_MESSAGES): Promise<SolunaMessage[]> {
  const { resources } = await recordsContainer().items
    .query<SolunaMessage & { docType: string }>({
      query:
        "SELECT * FROM c WHERE c.userId = @userId AND c.docType = 'message' ORDER BY c.createdAt DESC OFFSET 0 LIMIT @limit",
      parameters: [
        { name: "@userId", value: userId },
        { name: "@limit", value: limit },
      ],
    })
    .fetchAll();

  return resources
    .map(({ docType: _docType, ...message }) => message)
    .reverse();
}

export async function appendMessages(userId: string, messages: SolunaMessage[]): Promise<void> {
  const container = recordsContainer();
  for (const message of messages) {
    await container.items.upsert({ ...message, docType: "message" });
  }

  const all = await listMessages(userId, MAX_MESSAGES + 20);
  const stale = all.slice(0, Math.max(0, all.length - MAX_MESSAGES));
  for (const message of stale) {
    await container.item(message.id, userId).delete();
  }
}

function createShortcutTokenValue(): string {
  return randomBytes(24).toString("base64url");
}

export async function getShortcutToken(userId: string): Promise<string> {
  const { resources } = await tokensContainer().items
    .query<{ id: string; userId: string }>({
      query: "SELECT * FROM c WHERE c.userId = @userId",
      parameters: [{ name: "@userId", value: userId }],
    })
    .fetchAll();

  if (resources[0]?.id) return resources[0].id;
  return rotateShortcutToken(userId);
}

export async function rotateShortcutToken(userId: string): Promise<string> {
  const container = tokensContainer();
  const { resources } = await container.items
    .query<{ id: string; userId: string }>({
      query: "SELECT * FROM c WHERE c.userId = @userId",
      parameters: [{ name: "@userId", value: userId }],
    })
    .fetchAll();

  for (const existing of resources) {
    await container.item(existing.id, existing.id).delete();
  }

  const token = createShortcutTokenValue();
  await container.items.create({
    id: token,
    userId,
    createdAt: new Date().toISOString(),
  });
  return token;
}

export async function resolveUserIdByShortcutToken(token: string): Promise<string | null> {
  const trimmed = token.trim();
  if (!trimmed) return null;
  try {
    const { resource } = await tokensContainer().item(trimmed, trimmed).read<{ userId: string }>();
    return resource?.userId ?? null;
  } catch {
    return null;
  }
}

export function createMessage(
  userId: string,
  role: SolunaMessage["role"],
  content: string,
): SolunaMessage {
  return {
    id: `msg-${randomUUID()}`,
    userId,
    role,
    content,
    createdAt: new Date().toISOString(),
  };
}

export function createMemory(
  userId: string,
  character: "sol" | "luna",
  category: SolunaMemory["category"],
  content: string,
): SolunaMemory {
  return {
    id: `mem-${randomUUID()}`,
    userId,
    character,
    category,
    content: content.slice(0, 200),
    createdAt: new Date().toISOString(),
  };
}
