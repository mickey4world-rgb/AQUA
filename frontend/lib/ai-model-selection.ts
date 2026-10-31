/**
 * AI 防御で使う Gemini モデルの自動選定（純粋関数）。
 * 新しい版番号を推測して試し、無料枠で応答したものの中から最新を選ぶ。
 * 無料枠外（有料のみ）のモデルは応答しないため、自然に候補から外れる＝課金しない。
 */

export const LATEST_ALIAS = "gemini-flash-latest";

/**
 * テキスト生成で使う無料枠 Flash の正本。
 * gemini.ts / grounding / chat / セキュリティ選定はここを参照し、古い 2.x を個別に並べない。
 */
export const KNOWN_FLASH_MODELS = [LATEST_ALIAS, "gemini-3.6-flash"] as const;

type ParsedFlash = { major: number; minor: number; lite: boolean };

export function parseFlashModel(model: string): ParsedFlash | null {
  const m = /^gemini-(\d+)\.(\d+)-flash(-lite)?$/.exec(model.trim().toLowerCase());
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), lite: Boolean(m[3]) };
}

function versionScore(p: ParsedFlash): number {
  return p.major * 1000 + p.minor;
}

/** 既知の最新版の「次」を最大3つ推測する（例: 3.6 → 3.7, 3.8, 4.0） */
export function nextFlashCandidates(known: string[]): string[] {
  const parsed = known.map(parseFlashModel).filter((p): p is ParsedFlash => p != null && !p.lite);
  if (parsed.length === 0) return [];
  const top = parsed.reduce((a, b) => (versionScore(b) > versionScore(a) ? b : a));
  return [
    `gemini-${top.major}.${top.minor + 1}-flash`,
    `gemini-${top.major}.${top.minor + 2}-flash`,
    `gemini-${top.major + 1}.0-flash`,
  ];
}

export type ModelProbe = {
  model: string;
  ok: boolean;
  latencyMs: number;
  /** エイリアスが実際に解決されたモデル名 */
  resolvedVersion?: string | null;
  reason?: string | null;
};

/**
 * 応答した候補のうち、版番号が最も新しい通常 Flash を選ぶ。
 * 版番号付きが無ければ最新エイリアス、それも無ければ lite、全滅なら前回の選択を維持。
 */
export function chooseModel(probes: ModelProbe[], previous: string | null): string | null {
  const ok = probes.filter((p) => p.ok);
  const versioned = ok
    .map((p) => ({ probe: p, parsed: parseFlashModel(p.model) }))
    .filter((x): x is { probe: ModelProbe; parsed: ParsedFlash } => x.parsed != null);
  const full = versioned.filter((x) => !x.parsed.lite);
  if (full.length > 0) {
    return full.reduce((a, b) => (versionScore(b.parsed) > versionScore(a.parsed) ? b : a)).probe.model;
  }
  if (ok.some((p) => p.model === LATEST_ALIAS)) return LATEST_ALIAS;
  if (versioned.length > 0) {
    return versioned.reduce((a, b) => (versionScore(b.parsed) > versionScore(a.parsed) ? b : a)).probe.model;
  }
  if (ok.length > 0) return ok[0].model;
  return previous;
}

/** 試すモデルの一覧（重複なし・上限付き）。既知モデル＋推測した次の版 */
export function probeCandidates(known: string[], previous: string | null, limit = 6): string[] {
  const base = [previous, LATEST_ALIAS, ...known].filter((m): m is string => Boolean(m));
  return [...new Set([...nextFlashCandidates(base), ...base])].slice(0, limit);
}
