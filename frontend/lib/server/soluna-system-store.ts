import { randomUUID } from "crypto";
import { COSMOS_CONTAINERS, getContainer, isCosmosConfigured } from "@/lib/server/cosmos";
import { SOLUNA_SYSTEM_USER_ID } from "@/lib/server/soluna-system-config";
import { defaultHunterState, withLevelProgress } from "@/lib/server/soluna-battle";
import { enrichBriefingWithMonsters } from "@/lib/soluna-monsters";
import type {
  SolunaAssetLedger,
  SolunaBoincRun,
  SolunaHunterState,
  SolunaNewsBriefing,
  SolunaNoteArticle,
  SolunaSystemEpisode,
  SolunaSystemMessage,
  SolunaSystemPersonalityState,
} from "@/lib/types/soluna";

const MAX_SYSTEM_MESSAGES = 48;
const MAX_EPISODES = 32;

type StoredBriefing = SolunaNewsBriefing & { docType: "systemBriefing"; userId: string };
type StoredSystemMessage = SolunaSystemMessage & { docType: "systemMessage"; userId: string };
type StoredEpisode = import("@/lib/types/soluna").SolunaSystemEpisode & {
  docType: "systemEpisode";
  userId: string;
};
type StoredPersonality = import("@/lib/types/soluna").SolunaSystemPersonalityState & {
  id: "system-personality";
  userId: string;
  docType: "systemPersonality";
};
type StoredHunter = SolunaHunterState & {
  id: "system-hunter";
  userId: string;
  docType: "systemHunter";
};
type StoredMeta = {
  id: "system-meta";
  userId: string;
  docType: "systemMeta";
  lastRunAt: string | null;
  updatedAt: string;
};
type StoredNote = SolunaNoteArticle & { userId: string; docType: "systemNoteArticle" };
type StoredBoinc = SolunaBoincRun & { userId: string; docType: "systemBoincRun" };
type StoredAssets = SolunaAssetLedger & {
  id: "system-assets";
  userId: string;
  docType: "systemAssets";
};

function recordsContainer() {
  return getContainer(COSMOS_CONTAINERS.solunaRecords);
}

export function isSolunaSystemStorageConfigured(): boolean {
  return isCosmosConfigured();
}

export async function getLatestBriefing(): Promise<SolunaNewsBriefing | null> {
  const { resources } = await recordsContainer().items
    .query<StoredBriefing>({
      query:
        "SELECT * FROM c WHERE c.userId = @userId AND c.docType = 'systemBriefing' ORDER BY c.fetchedAt DESC OFFSET 0 LIMIT 1",
      parameters: [{ name: "@userId", value: SOLUNA_SYSTEM_USER_ID }],
    })
    .fetchAll();

  const resource = resources[0];
  if (!resource) return null;
  const { docType: _docType, userId: _userId, ...briefing } = resource;
  return enrichBriefingWithMonsters(briefing);
}

export async function saveBriefing(briefing: SolunaNewsBriefing): Promise<void> {
  const enriched = enrichBriefingWithMonsters(briefing);
  await recordsContainer().items.upsert({
    ...enriched,
    userId: SOLUNA_SYSTEM_USER_ID,
    docType: "systemBriefing",
  });
}

export async function listSystemMessages(limit = MAX_SYSTEM_MESSAGES): Promise<SolunaSystemMessage[]> {
  const { resources } = await recordsContainer().items
    .query<StoredSystemMessage>({
      query:
        "SELECT * FROM c WHERE c.userId = @userId AND c.docType = 'systemMessage' ORDER BY c.createdAt DESC OFFSET 0 LIMIT @limit",
      parameters: [
        { name: "@userId", value: SOLUNA_SYSTEM_USER_ID },
        { name: "@limit", value: limit },
      ],
    })
    .fetchAll();

  return resources
    .map(({ docType: _docType, userId: _userId, ...message }) => message)
    .reverse();
}

export async function appendSystemMessages(messages: SolunaSystemMessage[]): Promise<void> {
  if (messages.length === 0) return;
  const container = recordsContainer();
  for (const message of messages) {
    await container.items.upsert({
      ...message,
      userId: SOLUNA_SYSTEM_USER_ID,
      docType: "systemMessage",
    });
  }

  const all = await listSystemMessages(MAX_SYSTEM_MESSAGES + 12);
  const stale = all.slice(0, Math.max(0, all.length - MAX_SYSTEM_MESSAGES));
  for (const message of stale) {
    await container.item(message.id, SOLUNA_SYSTEM_USER_ID).delete();
  }
}

export async function getSystemLastRunAt(): Promise<string | null> {
  try {
    const { resource } = await recordsContainer()
      .item("system-meta", SOLUNA_SYSTEM_USER_ID)
      .read<StoredMeta>();
    return resource?.lastRunAt ?? null;
  } catch {
    return null;
  }
}

export async function markSystemRunAt(iso: string): Promise<void> {
  const now = new Date().toISOString();
  await recordsContainer().items.upsert({
    id: "system-meta",
    userId: SOLUNA_SYSTEM_USER_ID,
    docType: "systemMeta",
    lastRunAt: iso,
    updatedAt: now,
  } satisfies StoredMeta);
}

export function createSystemMessage(
  role: SolunaSystemMessage["role"],
  content: string,
  meta?: Pick<SolunaSystemMessage, "provider" | "model" | "modelLabel" | "briefingId" | "kind">,
): SolunaSystemMessage {
  return {
    id: `sys-${randomUUID()}`,
    role,
    content,
    createdAt: new Date().toISOString(),
    ...meta,
  };
}

export async function getSystemHunter(): Promise<SolunaHunterState> {
  try {
    const { resource } = await recordsContainer()
      .item("system-hunter", SOLUNA_SYSTEM_USER_ID)
      .read<StoredHunter>();
    if (!resource) return defaultHunterState();
    const { id: _id, userId: _userId, docType: _docType, ...hunter } = resource;
    return withLevelProgress(hunter);
  } catch {
    return defaultHunterState();
  }
}

export async function saveSystemHunter(hunter: SolunaHunterState): Promise<SolunaHunterState> {
  const next = withLevelProgress({ ...hunter, updatedAt: new Date().toISOString() });
  await recordsContainer().items.upsert({
    id: "system-hunter",
    userId: SOLUNA_SYSTEM_USER_ID,
    docType: "systemHunter",
    ...next,
  } satisfies StoredHunter);
  return next;
}

export function briefingDocIdForDate(date = new Date()): string {
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(jst.getUTCDate()).padStart(2, "0");
  return `briefing-${y}-${m}-${d}`;
}

export async function getSystemPersonality(): Promise<SolunaSystemPersonalityState | null> {
  try {
    const { resource } = await recordsContainer()
      .item("system-personality", SOLUNA_SYSTEM_USER_ID)
      .read<StoredPersonality>();
    if (!resource) return null;
    const { id: _id, userId: _userId, docType: _docType, ...personality } = resource;
    return personality;
  } catch {
    return null;
  }
}

export async function saveSystemPersonality(
  personality: SolunaSystemPersonalityState,
): Promise<SolunaSystemPersonalityState> {
  const updated = { ...personality, updatedAt: new Date().toISOString() };
  await recordsContainer().items.upsert({
    id: "system-personality",
    userId: SOLUNA_SYSTEM_USER_ID,
    docType: "systemPersonality",
    ...updated,
  } satisfies StoredPersonality);
  return updated;
}

export async function listSystemEpisodes(limit = 16): Promise<SolunaSystemEpisode[]> {
  const { resources } = await recordsContainer().items
    .query<StoredEpisode>({
      query:
        "SELECT * FROM c WHERE c.userId = @userId AND c.docType = 'systemEpisode' ORDER BY c.createdAt DESC OFFSET 0 LIMIT @limit",
      parameters: [
        { name: "@userId", value: SOLUNA_SYSTEM_USER_ID },
        { name: "@limit", value: limit },
      ],
    })
    .fetchAll();

  return resources.map(({ docType: _docType, userId: _userId, ...episode }) => episode);
}

export async function saveSystemEpisode(episode: SolunaSystemEpisode): Promise<void> {
  await recordsContainer().items.upsert({
    ...episode,
    userId: SOLUNA_SYSTEM_USER_ID,
    docType: "systemEpisode",
  });

  const all = await listSystemEpisodes(MAX_EPISODES + 8);
  const stale = all.slice(MAX_EPISODES);
  for (const item of stale) {
    await recordsContainer().item(item.id, SOLUNA_SYSTEM_USER_ID).delete();
  }
}

export function createSystemEpisode(
  character: SolunaSystemEpisode["character"],
  highlight: string,
  summary: string,
  topics: string[],
  briefingId?: string,
): SolunaSystemEpisode {
  return {
    id: `ep-${randomUUID()}`,
    character,
    highlight: highlight.slice(0, 120),
    summary: summary.slice(0, 280),
    topics: topics.slice(0, 8),
    createdAt: new Date().toISOString(),
    briefingId,
  };
}

export async function saveSystemNoteArticle(article: SolunaNoteArticle): Promise<void> {
  await recordsContainer().items.upsert({
    ...article,
    userId: SOLUNA_SYSTEM_USER_ID,
    docType: "systemNoteArticle",
  } satisfies StoredNote);
}

export async function getLatestNoteArticle(): Promise<SolunaNoteArticle | null> {
  const { resources } = await recordsContainer().items
    .query<StoredNote>({
      query:
        "SELECT * FROM c WHERE c.userId = @userId AND c.docType = 'systemNoteArticle' ORDER BY c.createdAt DESC OFFSET 0 LIMIT 1",
      parameters: [{ name: "@userId", value: SOLUNA_SYSTEM_USER_ID }],
    })
    .fetchAll();
  const resource = resources[0];
  if (!resource) return null;
  const { userId: _userId, docType: _docType, ...article } = resource;
  return article;
}

export async function saveSystemBoincRun(run: SolunaBoincRun): Promise<void> {
  await recordsContainer().items.upsert({
    ...run,
    userId: SOLUNA_SYSTEM_USER_ID,
    docType: "systemBoincRun",
  } satisfies StoredBoinc);
}

export async function getLatestBoincRun(): Promise<SolunaBoincRun | null> {
  const { resources } = await recordsContainer().items
    .query<StoredBoinc>({
      query:
        "SELECT * FROM c WHERE c.userId = @userId AND c.docType = 'systemBoincRun' ORDER BY c.createdAt DESC OFFSET 0 LIMIT 1",
      parameters: [{ name: "@userId", value: SOLUNA_SYSTEM_USER_ID }],
    })
    .fetchAll();
  const resource = resources[0];
  if (!resource) return null;
  const { userId: _userId, docType: _docType, ...run } = resource;
  return run;
}

export async function saveSystemAssets(assets: SolunaAssetLedger): Promise<void> {
  await recordsContainer().items.upsert({
    id: "system-assets",
    userId: SOLUNA_SYSTEM_USER_ID,
    docType: "systemAssets",
    ...assets,
  } satisfies StoredAssets);
}

export async function getSystemAssets(): Promise<SolunaAssetLedger | null> {
  try {
    const { resource } = await recordsContainer()
      .item("system-assets", SOLUNA_SYSTEM_USER_ID)
      .read<StoredAssets>();
    if (!resource) return null;
    const { id: _id, userId: _userId, docType: _docType, ...assets } = resource;
    return assets;
  } catch {
    return null;
  }
}
