/**
 * 自分の note.com アカウントへ日次記事を公開する。
 * note に公式公開 API はないため、ブラウザと同じ内部 API を Cookie で叩く。
 * Cookie は環境変数のみ。ログに出さない。
 */
import { noteVisibleLength } from "@/lib/server/soluna-note-article";

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
    id?: number | string;
    key?: string;
    note_url?: string;
    noteUrl?: string;
    uuid?: string;
    url?: string;
    note?: {
      id?: number | string;
      key?: string;
    };
  };
  error?: { message?: string; code?: string | number };
  message?: string;
  status?: number | string;
};

const EDITOR_HEADERS_BASE = {
  "Content-Type": "application/json",
  "X-Requested-With": "XMLHttpRequest",
  Origin: "https://editor.note.com",
  Referer: "https://editor.note.com/",
  Accept: "application/json, text/plain, */*",
};

/** Cookie から XSRF トークンを拾う（あれば X-XSRF-TOKEN に載せる） */
function extractXsrfToken(cookie: string): string | null {
  const patterns = [
    /(?:^|;\s*)XSRF-TOKEN=([^;]+)/i,
    /(?:^|;\s*)_xsrf=([^;]+)/i,
    /(?:^|;\s*)note_xsrf_token=([^;]+)/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(cookie);
    if (match?.[1]) {
      try {
        return decodeURIComponent(match[1]);
      } catch {
        return match[1];
      }
    }
  }
  return null;
}

function editorHeaders(cookie: string): Record<string, string> {
  const headers: Record<string, string> = {
    ...EDITOR_HEADERS_BASE,
    Cookie: cookie,
  };
  const xsrf = extractXsrfToken(cookie);
  if (xsrf) {
    headers["X-XSRF-TOKEN"] = xsrf;
  }
  return headers;
}

function summarizeNotePayload(payload: NoteApiJson): string {
  const dataKeys = payload.data ? Object.keys(payload.data).join(",") : "(no data)";
  const err =
    payload.error?.message ||
    payload.message ||
    (typeof payload.status !== "undefined" ? `status=${payload.status}` : "");
  return `dataKeys=[${dataKeys}]${err ? ` err=${err}` : ""}`;
}

function readDraftIds(payload: NoteApiJson): { draftId: number; noteKey: string } | null {
  const rawId = payload.data?.id ?? payload.data?.note?.id;
  const noteKey = payload.data?.key ?? payload.data?.note?.key;
  const draftId = typeof rawId === "string" ? Number(rawId) : rawId;
  if (!draftId || !Number.isFinite(draftId) || !noteKey) return null;
  return { draftId, noteKey };
}

async function noteFetch(path: string, init: RequestInit): Promise<NoteApiJson> {
  const cookie = noteCookie();
  if (!cookie) throw new Error("NOTE_COOKIE が未設定です。");

  const response = await fetch(`https://note.com/api${path}`, {
    ...init,
    headers: {
      ...editorHeaders(cookie),
      ...(init.headers ?? {}),
    },
  });

  const payload = (await response.json().catch(() => ({}))) as NoteApiJson;
  if (!response.ok) {
    const msg =
      payload.error?.message ||
      payload.message ||
      `note.com HTTP ${response.status}`;
    // 認証切れを分かりやすく
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `${msg}（NOTE_COOKIE の期限切れの可能性。ブラウザで再ログインし Cookie を更新してください）`,
      );
    }
    throw new Error(`${msg}｜${summarizeNotePayload(payload)}`);
  }
  return payload;
}

function publicSiteOrigin(): string {
  return (
    process.env.PRODUCTION_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "https://www.aquacore.net"
  ).replace(/\/$/, "");
}

/**
 * ヘッダー用 characters.png を取得。
 * SWA API では public/ がディスクに無いことが多いので、公開 URL からの取得を優先する。
 */
async function loadEyecatchImageBuffer(): Promise<Buffer> {
  const remoteUrl = `${publicSiteOrigin()}/soluna/characters.png`;
  try {
    const response = await fetch(remoteUrl, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength < 1000) {
      throw new Error("画像サイズが小さすぎます");
    }
    return Buffer.from(arrayBuffer);
  } catch (remoteErr) {
    const remoteMsg = remoteErr instanceof Error ? remoteErr.message : String(remoteErr);
    try {
      const { readFile } = await import("fs/promises");
      const { join } = await import("path");
      const imagePath = join(process.cwd(), "public", "soluna", "characters.png");
      return await readFile(imagePath);
    } catch (localErr) {
      const localMsg = localErr instanceof Error ? localErr.message : String(localErr);
      throw new Error(
        `ヘッダー画像を取得できません（remote: ${remoteMsg} / local: ${localMsg}）`,
      );
    }
  }
}

/**
 * note.com に画像をアップロードして uuid を返す。
 */
async function uploadNoteImage(imageBuffer: Buffer, mimeType: string): Promise<string> {
  const cookieValue = noteCookie();
  if (!cookieValue) throw new Error("NOTE_COOKIE が未設定です。");
  const cookie: string = cookieValue;

  const boundary = `----NoteUpload${Date.now()}`;
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="characters.png"\r\nContent-Type: ${mimeType}\r\n\r\n`,
    ),
    imageBuffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  async function postTo(path: string): Promise<{ ok: boolean; status: number; payload: NoteApiJson }> {
    const headers = editorHeaders(cookie);
    headers["Content-Type"] = `multipart/form-data; boundary=${boundary}`;
    const response = await fetch(`https://note.com/api${path}`, {
      method: "POST",
      headers,
      body,
    });
    const payload = (await response.json().catch(() => ({}))) as NoteApiJson;
    return { ok: response.ok, status: response.status, payload };
  }

  let result = await postTo("/v1/images");
  if (!result.ok) {
    result = await postTo("/v1/images/upload");
  }
  if (!result.ok) {
    throw new Error(
      result.payload.error?.message ?? `note 画像アップロード HTTP ${result.status}`,
    );
  }

  const uuid = result.payload.data?.uuid;
  if (!uuid) throw new Error("note 画像の uuid を取得できませんでした。");
  return uuid;
}

/**
 * NOTE_EYECATCH_UUID があればそれを使い、なければ画像をアップロードして取得する。
 * NOTE_EYECATCH_FORCE_UPLOAD=1 のときは毎回再アップロードする。
 */
async function getEyecatchUuid(): Promise<string | null> {
  const forceUpload = process.env.NOTE_EYECATCH_FORCE_UPLOAD?.trim() === "1";
  const cached = process.env.NOTE_EYECATCH_UUID?.trim();
  if (cached && !forceUpload) return cached;

  try {
    const imageBuffer = await loadEyecatchImageBuffer();
    const uuid = await uploadNoteImage(imageBuffer, "image/png");
    console.log(`[note-publish] 画像アップロード完了。uuid=${uuid}`);
    console.log(
      `[note-publish] SWA 環境変数 NOTE_EYECATCH_UUID=${uuid} を設定すると次回から再アップロードをスキップできます。`,
    );
    return uuid;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[note-publish] ヘッダー画像アップロードをスキップ: ${msg}`);
    return cached || null;
  }
}

function eyecatchPayload(eyecatchUuid: string | null): Record<string, string> {
  if (!eyecatchUuid) return {};
  return {
    eyecatch: eyecatchUuid,
    eyecatch_image_uuid: eyecatchUuid,
  };
}

export async function publishNoteArticle(input: {
  title: string;
  freeHtml: string;
  paidHtml: string;
  priceYen: number;
  /** free_body 末尾ブロック id（有料境界） */
  separator?: string | null;
  hashtags?: string[];
  imageKeys?: string[];
}): Promise<{ noteKey: string; noteUrl: string }> {
  // 画像は作成後の draft_save / publish で付ける。
  // 新規作成ペイロードに eyecatch を混ぜると id/key が返らない事例があるため分離する。
  const eyecatchUuid = await getEyecatchUuid();

  // 最終ガード: 外部ドメイン img が残っていたら公開前に落とす
  const freeHtml = stripExternalImages(input.freeHtml);
  const paidHtml = stripExternalImages(input.paidHtml);
  const combinedLength = noteVisibleLength(freeHtml, paidHtml);
  const hashtags = (input.hashtags ?? [])
    .map((t) => t.replace(/^#/, "").trim())
    .filter(Boolean)
    .slice(0, 10);
  const imageKeys = input.imageKeys?.filter(Boolean) ?? [];

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

  const ids = readDraftIds(created);
  if (!ids) {
    console.error(`[note-publish] create response unexpected: ${summarizeNotePayload(created)}`);
    throw new Error(
      `note の下書き ID を取得できませんでした。NOTE_COOKIE 期限切れか API 応答変化の可能性。${summarizeNotePayload(created)}`,
    );
  }

  const { draftId, noteKey } = ids;

  await noteFetch(`/v1/text_notes/draft_save?id=${draftId}&is_temp_saved=true`, {
    method: "POST",
    body: JSON.stringify({
      name: input.title,
      body: `${freeHtml}${paidHtml}`,
      body_length: combinedLength,
      index: false,
      is_lead_form: false,
      ...eyecatchPayload(eyecatchUuid),
    }),
  });

  const publishBody: Record<string, unknown> = {
    name: input.title,
    free_body: freeHtml,
    pay_body: paidHtml,
    body_length: combinedLength,
    status: "published",
    price: input.priceYen,
    // null を入れると 500 になることがあるため空オブジェクトを送る
    lead_form: { is_active: false, consent_url: "" },
    line_add_friend: { is_active: false, keyword: "", add_friend_url: "" },
    ...eyecatchPayload(eyecatchUuid),
  };
  if (input.separator) {
    publishBody.separator = input.separator;
  }
  if (hashtags.length > 0) {
    publishBody.hashtags = hashtags;
    publishBody.hashtag_notes_attributes = hashtags.map((name) => ({ name }));
  }
  // 空配列は note 側で落ちる事例があるため、キーがあるときだけ送る
  if (imageKeys.length > 0) {
    publishBody.image_keys = imageKeys;
  }

  const published = await noteFetch(`/v1/text_notes/${draftId}`, {
    method: "PUT",
    body: JSON.stringify(publishBody),
  });

  const url =
    published.data?.noteUrl ??
    published.data?.note_url ??
    `https://note.com/n/${noteKey}`;

  return { noteKey, noteUrl: url };
}

/** note 公開時に拒否される外部 img を除去する最終ガード */
function stripExternalImages(html: string): string {
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const src = /src=["']([^"']+)["']/i.exec(tag)?.[1] ?? "";
    if (!src) return "";
    try {
      const host = new URL(src).hostname;
      if (host === "assets.st-note.com" || host.endsWith(".st-note.com")) {
        return tag;
      }
    } catch {
      return "";
    }
    console.warn(`[note-publish] 外部画像を本文から除去: ${src.slice(0, 120)}`);
    return "";
  });
}
