/**
 * 自分の note.com アカウントへ日次記事を公開する。
 * note に公式公開 API はないため、ブラウザと同じ内部 API を Cookie で叩く。
 * Cookie は環境変数のみ。ログに出さない。
 */
function noteCookie(): string | null {
  return process.env.NOTE_COOKIE?.trim() || process.env.NOTE_SESSION_COOKIE?.trim() || null;
}

export function isNotePublishConfigured(): boolean {
  return Boolean(noteCookie());
}

export function noteCreatorUrl(): string | undefined {
  const name = process.env.NOTE_CREATOR_URLNAME?.trim();
  return name ? `https://note.com/${name}` : undefined;
}

type NoteApiJson = {
  data?: {
    id?: number;
    key?: string;
    note_url?: string;
    noteUrl?: string;
  };
  error?: { message?: string };
};

const EDITOR_HEADERS = {
  "Content-Type": "application/json",
  "X-Requested-With": "XMLHttpRequest",
  Origin: "https://editor.note.com",
  Referer: "https://editor.note.com/",
};

async function noteFetch(path: string, init: RequestInit): Promise<NoteApiJson> {
  const cookie = noteCookie();
  if (!cookie) throw new Error("NOTE_COOKIE が未設定です。");

  const response = await fetch(`https://note.com/api${path}`, {
    ...init,
    headers: {
      ...EDITOR_HEADERS,
      Cookie: cookie,
      ...(init.headers ?? {}),
    },
  });

  const payload = (await response.json().catch(() => ({}))) as NoteApiJson;
  if (!response.ok) {
    throw new Error(payload.error?.message ?? `note.com HTTP ${response.status}`);
  }
  return payload;
}

export async function publishNoteArticle(input: {
  title: string;
  freeHtml: string;
  paidHtml: string;
  priceYen: number;
}): Promise<{ noteKey: string; noteUrl: string }> {
  const created = await noteFetch("/v1/text_notes", {
    method: "POST",
    body: JSON.stringify({
      body: "",
      body_length: 0,
      name: input.title,
      index: false,
      is_lead_form: false,
    }),
  });

  const draftId = created.data?.id;
  const noteKey = created.data?.key;
  if (!draftId || !noteKey) {
    throw new Error("note の下書き ID を取得できませんでした。");
  }

  const combinedLength = input.freeHtml.length + input.paidHtml.length;
  await noteFetch(`/v1/text_notes/draft_save?id=${draftId}&is_temp_saved=true`, {
    method: "POST",
    body: JSON.stringify({
      name: input.title,
      body: `${input.freeHtml}${input.paidHtml}`,
      body_length: combinedLength,
      index: false,
      is_lead_form: false,
    }),
  });

  const published = await noteFetch(`/v1/text_notes/${draftId}`, {
    method: "PUT",
    body: JSON.stringify({
      name: input.title,
      free_body: input.freeHtml,
      pay_body: input.paidHtml,
      body_length: combinedLength,
      status: "published",
      price: input.priceYen,
    }),
  });

  const url =
    published.data?.noteUrl ??
    published.data?.note_url ??
    `https://note.com/n/${noteKey}`;

  return { noteKey, noteUrl: url };
}
