import { randomUUID } from "crypto";
import { COSMOS_CONTAINERS, getContainer, isCosmosConfigured } from "@/lib/server/cosmos";
import { sanitizeText } from "@/lib/server/security";
import { resolveWorksTopic, type WorkNote, type WorkNoteDraft } from "@/lib/types/works";

const MAX_NOTES = 100;

function notesContainer() {
  return getContainer(COSMOS_CONTAINERS.workNotes);
}

function normalizeDraft(draft: WorkNoteDraft): WorkNoteDraft {
  return {
    title: sanitizeText(draft.title ?? "", 80) || "無題のメモ",
    summary: sanitizeText(draft.summary ?? "", 2000),
    steps: (draft.steps ?? [])
      .slice(0, 10)
      .map((step) => sanitizeText(step, 400))
      .filter(Boolean),
    claudePrompt: sanitizeText(draft.claudePrompt ?? "", 4000),
    tags: (draft.tags ?? [])
      .slice(0, 5)
      .map((tag) => sanitizeText(tag, 24).toLowerCase())
      .filter(Boolean),
  };
}

export async function listWorkNotes(userId: string): Promise<WorkNote[]> {
  if (!isCosmosConfigured()) return [];

  try {
    const { resources } = await notesContainer()
      .items.query<WorkNote>({
        query:
          "SELECT * FROM c WHERE c.userId = @userId ORDER BY c.createdAt DESC OFFSET 0 LIMIT @limit",
        parameters: [
          { name: "@userId", value: userId },
          { name: "@limit", value: MAX_NOTES },
        ],
      })
      .fetchAll();
    return resources;
  } catch {
    return [];
  }
}

export async function createWorkNote(
  userId: string,
  draft: WorkNoteDraft,
  topicId: string,
  model: string,
): Promise<WorkNote> {
  const now = new Date().toISOString();
  const note: WorkNote = {
    id: randomUUID(),
    userId,
    topic: resolveWorksTopic(topicId).id,
    model: sanitizeText(model, 60),
    ...normalizeDraft(draft),
    createdAt: now,
    updatedAt: now,
  };

  const { resource } = await notesContainer().items.create(note);
  return resource ?? note;
}

export async function deleteWorkNote(userId: string, id: string): Promise<boolean> {
  try {
    await notesContainer().item(id, userId).delete();
    return true;
  } catch {
    return false;
  }
}
