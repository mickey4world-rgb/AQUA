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
    uuid?: string;
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

/**
 * note.com に画像をアップロードして uuid を返す。
 * 同じ画像を毎回アップロードしないよう、呼び出し元で uuid をキャッシュする。
 */
async function uploadNoteImage(imageBuffer: Buffer, mimeType: string): Promise<string> {
  const cookie = noteCookie();
  if (!cookie) throw new Error("NOTE_COOKIE が未設定です。");

  const boundary = `----NoteUpload${Date.now()}`;
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="header.png"\r\nContent-Type: ${mimeType}\r\n\r\n`),
    imageBuffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  const response = await fetch("https://note.com/api/v1/images", {
    method: "POST",
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "X-Requested-With": "XMLHttpRequest",
      Origin: "https://editor.note.com",
      Referer: "https://editor.note.com/",
      Cookie: cookie,
    },
    body,
  });

  const payload = (await response.json().catch(() => ({}))) as NoteApiJson;
  if (!response.ok) {
    throw new Error(payload.error?.message ?? `note 画像アップロード HTTP ${response.status}`);
  }
  const uuid = payload.data?.uuid;
  if (!uuid) throw new Error("note 画像の uuid を取得できませんでした。");
  return uuid;
}

/**
 * NOTE_EYECATCH_UUID 環境変数があればそれを使い、なければ画像をアップロードして取得する。
 * アップロードした uuid は自動でログ出力するので、次回から環境変数に設定できる。
 */
async function getEyecatchUuid(): Promise<string | null> {
  // 環境変数にキャッシュ済みの uuid があればそのまま使う
  const cached = process.env.NOTE_EYECATCH_UUID?.trim();
  if (cached) return cached;

  // SWA の public ディレクトリから画像を読み込む
  // Next.js の process.cwd() は frontend/ なので public/soluna/characters.png を参照
  try {
    const { readFile } = await import("fs/promises");
    const { join } = await import("path");
    const imagePath = join(process.cwd(), "public", "soluna", "characters.png");
    const imageBuffer = await readFile(imagePath);
    const uuid = await uploadNoteImage(imageBuffer, "image/png");
    console.log(`[note-publish] 画像アップロード完了。uuid=${uuid}`);
    console.log(`[note-publish] SWA 環境変数 NOTE_EYECATCH_UUID=${uuid} を設定すると次回から再アップロードをスキップできます。`);
    return uuid;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[note-publish] ヘッダー画像アップロードをスキップ: ${msg}`);
    return null;
  }
}

export async function publishNoteArticle(input: {
  title: string;
  freeHtml: string;
  paidHtml: string;
  priceYen: number;
}): Promise<{ noteKey: string; noteUrl: string }> {
  // ヘッダー画像の uuid を取得（失敗しても記事投稿は続行）
  const eyecatchUuid = await getEyecatchUuid();

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
      ...(eyecatchUuid ? { eyecatch_image_uuid: eyecatchUuid } : {}),
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
      ...(eyecatchUuid ? { eyecatch_image_uuid: eyecatchUuid } : {}),
    }),
  });

  const url =
    published.data?.noteUrl ??
    published.data?.note_url ??
    `https://note.com/n/${noteKey}`;

  return { noteKey, noteUrl: url };
}
