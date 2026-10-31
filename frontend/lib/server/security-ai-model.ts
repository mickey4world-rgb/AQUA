import {
  LATEST_ALIAS,
  chooseModel,
  probeCandidates,
  type ModelProbe,
} from "@/lib/ai-model-selection";
import {
  COSMOS_CONTAINERS,
  getContainer,
  isCosmosConfigured,
} from "@/lib/server/cosmos";
import { generateWithGemini, getGeminiModelCandidates } from "@/lib/server/gemini";

const STATE_ID = "ai-model-selection";
const BUCKET = "triage";
/** 手動再実行しても1日1回しか試さない（無料枠の消費を抑える） */
const RECHECK_HOURS = 20;
/** 定型の要約に深い思考は不要。思考を抑えると応答が速く、無料枠の消費も減る */
export const SECURITY_AI_THINKING_LEVEL = "low" as const;

export interface SecurityAiModelState {
  id: typeof STATE_ID;
  bucket: typeof BUCKET;
  docType: "ai-model-selection";
  selected: string | null;
  resolvedVersion: string | null;
  previous: string | null;
  switchedAt: string | null;
  checkedAt: string;
  /** この設定で試した結果。設定を変えたら選び直す */
  thinkingLevel?: string;
  probes: ModelProbe[];
}

function container() {
  return getContainer(COSMOS_CONTAINERS.securityEvents);
}

async function readState(): Promise<SecurityAiModelState | null> {
  if (!isCosmosConfigured()) return null;
  try {
    const { resource } = await container().item(STATE_ID, BUCKET).read<SecurityAiModelState>();
    return resource ?? null;
  } catch {
    return null;
  }
}

async function probe(model: string): Promise<ModelProbe> {
  const started = Date.now();
  const result = await generateWithGemini(
    {
      system: "動作確認です。OK とだけ返してください。",
      messages: [{ role: "user", content: "OK?" }],
      maxOutputTokens: 512,
      temperature: 0,
      // 本番の要約と同じ設定で試し、未対応モデルを選ばないようにする
      thinkingLevel: SECURITY_AI_THINKING_LEVEL,
    },
    { models: [model], maxAttempts: 1, timeoutMs: 20_000 },
  );
  return result.ok
    ? { model, ok: true, latencyMs: Date.now() - started, resolvedVersion: result.modelVersion ?? null }
    : { model, ok: false, latencyMs: Date.now() - started, reason: result.reason.slice(0, 160) };
}

/** 毎日の診断の冒頭で呼ぶ。新しいモデルが無料枠で使えるようになっていれば自動で切り替える */
export async function selectSecurityAiModel(now = new Date()): Promise<SecurityAiModelState> {
  const prev = await readState();
  if (
    prev &&
    prev.thinkingLevel === SECURITY_AI_THINKING_LEVEL &&
    now.getTime() - Date.parse(prev.checkedAt) < RECHECK_HOURS * 3_600_000
  ) {
    return prev;
  }

  const candidates = probeCandidates(getGeminiModelCandidates(), prev?.selected ?? null);
  // 直列だと最悪 6×20 秒で関数の上限 120 秒に届くため並列で試す
  const probes = await Promise.all(candidates.map((model) => probe(model)));
  const selected = chooseModel(probes, prev?.selected ?? null);
  const changed = Boolean(selected && prev?.selected && selected !== prev.selected);
  const state: SecurityAiModelState = {
    id: STATE_ID,
    bucket: BUCKET,
    docType: "ai-model-selection",
    selected,
    resolvedVersion:
      probes.find((p) => p.model === selected)?.resolvedVersion ??
      probes.find((p) => p.model === LATEST_ALIAS)?.resolvedVersion ??
      null,
    previous: changed ? prev!.selected : prev?.previous ?? null,
    switchedAt: changed ? now.toISOString() : prev?.switchedAt ?? (selected ? now.toISOString() : null),
    checkedAt: now.toISOString(),
    thinkingLevel: SECURITY_AI_THINKING_LEVEL,
    probes,
  };
  if (isCosmosConfigured()) {
    try {
      await container().items.upsert(state);
    } catch (error) {
      console.warn("[security-ai-model] save failed", error instanceof Error ? error.message : error);
    }
  }
  return state;
}

/** 選定モデルを先頭に、既定の候補を予備として並べる */
export function securityAiModelOrder(state: SecurityAiModelState | null): string[] {
  return [...new Set([state?.selected, ...getGeminiModelCandidates()].filter((m): m is string => Boolean(m)))];
}

export async function getSecurityAiModelState(): Promise<SecurityAiModelState | null> {
  return readState();
}
