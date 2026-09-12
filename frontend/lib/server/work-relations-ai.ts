import {
  assertJapanResidency,
  getAzureOpenAiClient,
  getAzureOpenAiDeployment,
  getDomesticDataRegionLabel,
  isDomesticJapanResidencyConfigured,
} from "@/lib/server/azure-openai";
import { canUseAiTokens, recordTokenUsage } from "@/lib/server/token-usage";
import { sanitizeText } from "@/lib/server/security";
import {
  normalizeAffiliation,
  normalizeEdge,
  normalizeEvent,
  normalizePerson,
} from "@/lib/server/work-relations";
import {
  RELATION_EDGE_KINDS,
  RELATION_ORG_KINDS,
  RELATION_PERSON_STATUSES,
  type RelationCardScanResult,
  type RelationMemoParseResult,
  type RelationOrgKind,
  type RelationWorkspace,
} from "@/lib/types/work-relations";

function domesticDeployment(): string {
  return (
    process.env.AZURE_OPENAI_DEPLOYMENT_DOMESTIC ?? getAzureOpenAiDeployment()
  );
}

function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("JSON not found");
    return JSON.parse(match[0]);
  }
}

function asOrgKind(value: unknown): RelationOrgKind {
  return RELATION_ORG_KINDS.includes(value as RelationOrgKind)
    ? (value as RelationOrgKind)
    : "other";
}

function parseMemoResult(parsed: unknown): RelationMemoParseResult | null {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const root = parsed as Record<string, unknown>;

  const peopleRaw = Array.isArray(root.people) ? root.people : [];
  const edgesRaw = Array.isArray(root.edges) ? root.edges : [];
  const eventsRaw = Array.isArray(root.events) ? root.events : [];

  const people = peopleRaw
    .slice(0, 30)
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const affiliationsRaw = Array.isArray(row.affiliations)
        ? row.affiliations
        : [];
      const affiliations = affiliationsRaw
        .slice(0, 10)
        .map((aff) =>
          aff && typeof aff === "object"
            ? normalizeAffiliation(aff as Record<string, unknown>)
            : null,
        )
        .filter((aff): aff is NonNullable<typeof aff> => Boolean(aff));

      return normalizePerson({
        name: typeof row.name === "string" ? row.name : "",
        orgKind: row.orgKind as never,
        orgName: typeof row.orgName === "string" ? row.orgName : "",
        title: typeof row.title === "string" ? row.title : "",
        email: typeof row.email === "string" ? row.email : "",
        phone: typeof row.phone === "string" ? row.phone : "",
        status: row.status as never,
        startedOn: typeof row.startedOn === "string" ? row.startedOn : null,
        endedOn: typeof row.endedOn === "string" ? row.endedOn : null,
        notes: typeof row.notes === "string" ? row.notes : "",
        tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
        affiliations:
          affiliations.length > 0
            ? affiliations
            : [
                {
                  id: "draft",
                  orgKind: asOrgKind(row.orgKind),
                  orgName: typeof row.orgName === "string" ? row.orgName : "",
                  unitName: typeof row.unitName === "string" ? row.unitName : "",
                  title: typeof row.title === "string" ? row.title : "",
                  email: typeof row.email === "string" ? row.email : "",
                  phone: typeof row.phone === "string" ? row.phone : "",
                  startedOn:
                    typeof row.startedOn === "string" ? row.startedOn : null,
                  endedOn: typeof row.endedOn === "string" ? row.endedOn : null,
                  notes: "",
                },
              ],
      });
    })
    .filter((person): person is NonNullable<typeof person> => Boolean(person))
    .map(({ id: _id, ...rest }) => rest);

  const edges = edgesRaw
    .slice(0, 40)
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const fromName = sanitizeText(String(row.fromName ?? ""), 80);
      const toName = sanitizeText(String(row.toName ?? ""), 80);
      if (!fromName || !toName || fromName === toName) return null;
      const kind = RELATION_EDGE_KINDS.includes(row.kind as never)
        ? (row.kind as (typeof RELATION_EDGE_KINDS)[number])
        : "other";
      const strength =
        row.strength === 1 || row.strength === 2 || row.strength === 3
          ? row.strength
          : 2;
      return {
        fromName,
        toName,
        kind,
        label: sanitizeText(String(row.label ?? ""), 80),
        strength: strength as 1 | 2 | 3,
        notes: sanitizeText(String(row.notes ?? ""), 1000),
      };
    })
    .filter((edge): edge is NonNullable<typeof edge> => Boolean(edge));

  const events = eventsRaw
    .slice(0, 20)
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const draft = normalizeEvent({
        title: typeof row.title === "string" ? row.title : "",
        occurredOn:
          typeof row.occurredOn === "string" ? row.occurredOn : undefined,
        notes: typeof row.notes === "string" ? row.notes : "",
        personIds: [],
      });
      if (!draft) return null;
      const { id: _id, personIds: _pids, ...rest } = draft;
      return {
        ...rest,
        personNames: Array.isArray(row.personNames)
          ? row.personNames
              .slice(0, 12)
              .map((name) => sanitizeText(String(name), 80))
              .filter(Boolean)
          : [],
      };
    })
    .filter((event): event is NonNullable<typeof event> => Boolean(event));

  return {
    people,
    edges,
    events,
    summary: sanitizeText(String(root.summary ?? ""), 500),
  };
}

function parseCardResult(parsed: unknown): RelationCardScanResult | null {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const row = parsed as Record<string, unknown>;
  const name = sanitizeText(String(row.name ?? ""), 80);
  const orgName = sanitizeText(String(row.orgName ?? ""), 120);
  if (!name && !orgName) return null;

  const confidenceRaw = String(row.confidence ?? "medium");
  const confidence =
    confidenceRaw === "high" || confidenceRaw === "low" ? confidenceRaw : "medium";

  return {
    name,
    orgKind: asOrgKind(row.orgKind),
    orgName,
    unitName: sanitizeText(String(row.unitName ?? ""), 120),
    title: sanitizeText(String(row.title ?? ""), 120),
    email: sanitizeText(String(row.email ?? ""), 120),
    phone: sanitizeText(String(row.phone ?? ""), 40),
    notes: sanitizeText(String(row.notes ?? ""), 500),
    confidence,
  };
}

const SYSTEM_PROMPT = `あなたは官公庁・関連業者の人間関係メモを構造化するアシスタントです。
推測で人物評定や噂を作らず、メモに書かれた事実だけを抽出してください。
出力は必ず JSON オブジェクトのみ。スキーマ:
{
  "summary": "短い要約",
  "people": [{
    "name": "氏名",
    "orgKind": ${JSON.stringify(RELATION_ORG_KINDS)},
    "orgName": "組織名",
    "unitName": "部署・室",
    "title": "役職",
    "email": "メール or 空",
    "phone": "電話 or 空",
    "status": ${JSON.stringify(RELATION_PERSON_STATUSES)},
    "startedOn": "YYYY-MM or YYYY-MM-DD or null",
    "endedOn": "YYYY-MM or YYYY-MM-DD or null",
    "notes": "事実メモ",
    "tags": ["任意"],
    "affiliations": [{
      "orgKind": ${JSON.stringify(RELATION_ORG_KINDS)},
      "orgName": "組織名",
      "unitName": "部署",
      "title": "役職",
      "email": "",
      "phone": "",
      "startedOn": "YYYY-MM or null",
      "endedOn": "YYYY-MM or null（現職は null）",
      "notes": ""
    }]
  }],
  "edges": [{
    "fromName": "氏名",
    "toName": "氏名",
    "kind": ${JSON.stringify(RELATION_EDGE_KINDS)},
    "label": "関係の短いラベル",
    "strength": 1|2|3,
    "notes": "根拠"
  }],
  "events": [{
    "title": "出来事",
    "occurredOn": "YYYY-MM-DD",
    "personNames": ["氏名"],
    "notes": "事実"
  }]
}
orgKind 判定:
- 最高裁・裁判所・事務総局 → supreme_court
- 内閣官房・行政改革・効率化推進 → cabinet
- 民間ベンダー・SIer・コンサル → vendor
- それ以外 → other
異動の記載がある場合は affiliations に過去と現在を分けて入れる。評価・印象語は notes に入れない。`;

const CARD_SYSTEM_PROMPT = `あなたは日本の名刺OCRアシスタントです。画像に書かれた事実だけを読み取り JSON のみ返す。
スキーマ:
{
  "name": "氏名（漢字優先）",
  "orgKind": ${JSON.stringify(RELATION_ORG_KINDS)},
  "orgName": "組織名・会社名",
  "unitName": "部署・室・グループ",
  "title": "役職",
  "email": "メールアドレス",
  "phone": "電話番号",
  "notes": "住所などその他の事実（任意）",
  "confidence": "high"|"medium"|"low"
}
orgKind 自動判別:
- 最高裁判所 / 裁判所 / 事務総局 → supreme_court
- 内閣官房 / 内閣府（官房系） / 行政改革 → cabinet
- 株式会社・合同会社・ベンダー・SIer など民間 → vendor
- 判別不能 → other
読めない欄は空文字。推測で氏名やメールを作らない。名刺でない画像なら name と orgName を空にし confidence を low。`;

export type ParseRelationMemoResult =
  | {
      ok: true;
      result: RelationMemoParseResult;
      model: string;
      dataRegion: string;
    }
  | { ok: false; reason: string };

export type ScanRelationCardResult =
  | {
      ok: true;
      result: RelationCardScanResult;
      model: string;
      dataRegion: string;
    }
  | { ok: false; reason: string };

async function ensureDomesticReady(
  userId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!isDomesticJapanResidencyConfigured()) {
    return {
      ok: false,
      reason:
        "国内保持の Azure OpenAI（Japan East / Japan West）が未設定です。この機能は海外リージョンや Gemini には送れません。",
    };
  }
  try {
    assertJapanResidency("domestic");
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof Error ? error.message : "国内リージョン検証に失敗しました。",
    };
  }
  const quota = await canUseAiTokens(userId);
  if (!quota.allowed) {
    return {
      ok: false,
      reason: `今月の AI 利用上限（${quota.limit.toLocaleString("ja-JP")} tokens）に達しました。`,
    };
  }
  return { ok: true };
}

export async function parseRelationMemo(
  userId: string,
  memo: string,
  workspace: RelationWorkspace,
): Promise<ParseRelationMemoResult> {
  const ready = await ensureDomesticReady(userId);
  if (!ready.ok) return ready;

  const trimmed = sanitizeText(memo, 8000);
  if (trimmed.length < 8) {
    return { ok: false, reason: "メモが短すぎます。" };
  }

  const knownPeople = workspace.people
    .slice(0, 80)
    .map(
      (person) =>
        `- ${person.name} / ${person.orgName || person.orgKind} / ${person.title || "役職不明"} / ${person.status}`,
    )
    .join("\n");

  const deployment = domesticDeployment();
  const client = getAzureOpenAiClient(deployment, "domestic");

  try {
    const completion = await client.chat.completions.create({
      model: deployment,
      max_completion_tokens: 2000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `【既存の登録人物（重複統合の参考）】\n${knownPeople || "（なし）"}\n\n【メモ】\n${trimmed}\n\nJSON のみ出力してください。`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) {
      return { ok: false, reason: "AI から抽出結果がありませんでした。" };
    }

    let parsed: unknown;
    try {
      parsed = extractJson(raw);
    } catch {
      return { ok: false, reason: "AI の出力を JSON として解析できませんでした。" };
    }

    const result = parseMemoResult(parsed);
    if (!result) {
      return { ok: false, reason: "抽出結果の形式が不正です。" };
    }

    const modelUsed = completion.model ?? deployment;
    if (completion.usage) {
      await recordTokenUsage({
        userId,
        feature: "relations-parse",
        model: modelUsed,
        promptTokens: completion.usage.prompt_tokens ?? 0,
        completionTokens: completion.usage.completion_tokens ?? 0,
        requestId: completion.id,
      });
    }

    return {
      ok: true,
      result,
      model: modelUsed,
      dataRegion: getDomesticDataRegionLabel(),
    };
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof Error
          ? `メモ解析に失敗しました: ${error.message}`
          : "メモ解析に失敗しました",
    };
  }
}

const MAX_CARD_BYTES = 900_000;

export function normalizeCardImageDataUrl(raw: string): {
  ok: true;
  dataUrl: string;
} | { ok: false; reason: string } {
  const trimmed = raw.trim();
  const match = trimmed.match(
    /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/i,
  );
  if (!match) {
    return {
      ok: false,
      reason: "画像は JPEG / PNG / WebP の data URL で送ってください。",
    };
  }
  const mime = match[1].toLowerCase().replace("image/jpg", "image/jpeg");
  const b64 = match[2].replace(/\s/g, "");
  const approxBytes = Math.floor((b64.length * 3) / 4);
  if (approxBytes < 2_000) {
    return { ok: false, reason: "画像が小さすぎます。名刺が写る写真を送ってください。" };
  }
  if (approxBytes > MAX_CARD_BYTES) {
    return {
      ok: false,
      reason: "画像が大きすぎます。撮影後に圧縮してから送ってください（約900KB以内）。",
    };
  }
  return { ok: true, dataUrl: `data:${mime};base64,${b64}` };
}

export async function scanRelationBusinessCard(
  userId: string,
  imageDataUrl: string,
): Promise<ScanRelationCardResult> {
  const ready = await ensureDomesticReady(userId);
  if (!ready.ok) return ready;

  const image = normalizeCardImageDataUrl(imageDataUrl);
  if (!image.ok) return image;

  const deployment = domesticDeployment();
  const client = getAzureOpenAiClient(deployment, "domestic");

  try {
    const completion = await client.chat.completions.create({
      model: deployment,
      max_completion_tokens: 800,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: CARD_SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "この名刺画像から項目を抽出し、所属種別 orgKind も判定して JSON のみ返してください。",
            },
            {
              type: "image_url",
              image_url: { url: image.dataUrl, detail: "high" },
            },
          ],
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) {
      return {
        ok: false,
        reason: "名刺を読み取れませんでした（AI応答が空）。別角度で再撮影してください。",
      };
    }

    let parsed: unknown;
    try {
      parsed = extractJson(raw);
    } catch {
      return { ok: false, reason: "名刺の抽出結果を解析できませんでした。" };
    }

    const result = parseCardResult(parsed);
    if (!result || (!result.name && !result.orgName)) {
      return {
        ok: false,
        reason:
          "名刺の氏名・組織を読み取れませんでした。ピント・明るさを確認して再撮影してください。",
      };
    }

    const modelUsed = completion.model ?? deployment;
    if (completion.usage) {
      await recordTokenUsage({
        userId,
        feature: "relations-card-scan",
        model: modelUsed,
        promptTokens: completion.usage.prompt_tokens ?? 0,
        completionTokens: completion.usage.completion_tokens ?? 0,
        requestId: completion.id,
      });
    }

    return {
      ok: true,
      result,
      model: modelUsed,
      dataRegion: getDomesticDataRegionLabel(),
    };
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof Error
          ? `名刺スキャンに失敗しました: ${error.message}`
          : "名刺スキャンに失敗しました",
    };
  }
}

/** Apply AI draft into an existing workspace (name-matched merge). */
export function mergeParsedIntoWorkspace(
  workspace: RelationWorkspace,
  parsed: RelationMemoParseResult,
): RelationWorkspace {
  const people = [...workspace.people];
  const nameToId = new Map(
    people.map((person) => [person.name.trim().toLowerCase(), person.id]),
  );

  for (const draft of parsed.people) {
    const key = draft.name.trim().toLowerCase();
    const existingId = nameToId.get(key);
    if (existingId) {
      const index = people.findIndex((person) => person.id === existingId);
      if (index >= 0) {
        const existing = people[index];
        const mergedAffiliations = [
          ...existing.affiliations,
          ...(draft.affiliations ?? []),
        ];
        const merged = normalizePerson(
          {
            ...existing,
            ...draft,
            affiliations: mergedAffiliations,
            notes: [existing.notes, draft.notes]
              .filter(Boolean)
              .join("\n")
              .slice(0, 2000),
            tags: [...new Set([...existing.tags, ...draft.tags])].slice(0, 8),
          },
          existingId,
        );
        if (merged) people[index] = merged;
      }
      continue;
    }
    const created = normalizePerson(draft);
    if (!created) continue;
    people.push(created);
    nameToId.set(key, created.id);
  }

  const edges = [...workspace.edges];
  for (const draft of parsed.edges) {
    const fromPersonId = nameToId.get(draft.fromName.trim().toLowerCase());
    const toPersonId = nameToId.get(draft.toName.trim().toLowerCase());
    if (!fromPersonId || !toPersonId) continue;
    const created = normalizeEdge({
      fromPersonId,
      toPersonId,
      kind: draft.kind,
      label: draft.label,
      strength: draft.strength,
      notes: draft.notes,
    });
    if (!created) continue;
    const duplicate = edges.some(
      (edge) =>
        edge.fromPersonId === created.fromPersonId &&
        edge.toPersonId === created.toPersonId &&
        edge.kind === created.kind,
    );
    if (!duplicate) edges.push(created);
  }

  const events = [...workspace.events];
  for (const draft of parsed.events) {
    const personIds = draft.personNames
      .map((name) => nameToId.get(name.trim().toLowerCase()))
      .filter((id): id is string => Boolean(id));
    const created = normalizeEvent({
      title: draft.title,
      occurredOn: draft.occurredOn,
      notes: draft.notes,
      personIds,
    });
    if (created) events.push(created);
  }

  return {
    ...workspace,
    people,
    edges,
    events,
  };
}
