/**
 * 攻撃元（国）→ 攻撃場所（機能）→ 手口の集計。
 * SecurityEvents の path / country / reason から素人向けに読み取れる表を作る。
 */

export type AttackTargetKind =
  | "auth"
  | "cron"
  | "public_api"
  | "stocks"
  | "soluna"
  | "news"
  | "space"
  | "costs"
  | "page"
  | "other";

export type AttackFlowRow = {
  country: string;
  targetKind: AttackTargetKind;
  targetLabel: string;
  pathSample: string;
  reasonSample: string;
  count: number;
};

export type AttackInsightReport = {
  flows: AttackFlowRow[];
  /** code は ISO 3166-1 alpha-2（不明は null）。地図の位置に使う */
  byCountry: Array<{ country: string; code: string | null; count: number }>;
  byTarget: Array<{ targetKind: AttackTargetKind; targetLabel: string; count: number }>;
  narrative: string[];
  totalEvents: number;
};

type EventLike = {
  country?: string | null;
  path?: string | null;
  reason?: string | null;
  count?: number | null;
};

const TARGET_LABEL: Record<AttackTargetKind, string> = {
  auth: "ログイン・認証",
  cron: "定時・自動タスク API",
  public_api: "公開 API",
  stocks: "株・市場 API",
  soluna: "Soluna API",
  news: "News Search API",
  space: "宇宙・衛星 API",
  costs: "コスト・運用画面 API",
  page: "画面・静的パス",
  other: "その他 API",
};

export function classifyAttackTarget(path: string): AttackTargetKind {
  const p = (path || "").toLowerCase();
  if (
    p.includes("/login") ||
    p.includes("/api/auth") ||
    p.includes("/.auth") ||
    p.includes("easyauth")
  ) {
    return "auth";
  }
  if (p.includes("/cron") || p.includes("/warm") || p.includes("/jobs")) {
    return "cron";
  }
  if (p.includes("/api/public") || p.includes("/api/sample")) {
    return "public_api";
  }
  if (p.includes("/api/stocks") || p.includes("/api/kabu") || p.includes("/market")) {
    return "stocks";
  }
  if (p.includes("/api/soluna") || p.includes("/soluna")) {
    return "soluna";
  }
  if (p.includes("/api/news") || p.includes("/news-search")) {
    return "news";
  }
  if (p.includes("/api/space") || p.includes("/space/")) {
    return "space";
  }
  if (p.includes("/api/costs") || p.includes("/costs")) {
    return "costs";
  }
  if (p.startsWith("/api/")) {
    return "other";
  }
  return "page";
}

function countryCode(raw: string | null | undefined): string | null {
  const c = (raw || "").trim().toUpperCase();
  if (!c || c === "?" || c === "UNKNOWN" || c === "不明") return null;
  return c;
}

let regionNames: Intl.DisplayNames | null = null;
/** 国コード → 日本語名（「CN」→「中国」）。変換できなければコードのまま */
export function countryNameJa(code: string | null): string {
  if (!code) return "不明";
  if (!/^[A-Z]{2}$/.test(code)) return code;
  try {
    regionNames ??= new Intl.DisplayNames(["ja"], { type: "region" });
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}

export type SuspiciousSource = {
  sourceHash: string;
  country: string;
  code: string | null;
  count: number;
  distinctPaths: number;
  pattern: "brute_force" | "scan" | "flood";
  patternLabel: string;
  topLabel: string;
  firstAt: string;
  lastAt: string;
};

type SourceEvent = {
  sourceHash: string;
  eventType: string;
  country: string | null;
  path: string;
  attackLabel: string;
  createdAt: string;
};

/** 同じ送信元からの集中（総当たり・探索・連打）。1〜4 回の散発は出さない */
export function buildSuspiciousSources(
  events: SourceEvent[],
  options?: { minCount?: number; limit?: number },
): SuspiciousSource[] {
  const min = options?.minCount ?? 5;
  const map = new Map<
    string,
    { events: SourceEvent[]; paths: Set<string>; labels: Map<string, number> }
  >();
  for (const e of events) {
    if (!e.sourceHash) continue;
    const entry = map.get(e.sourceHash) ?? {
      events: [] as SourceEvent[],
      paths: new Set<string>(),
      labels: new Map<string, number>(),
    };
    entry.events.push(e);
    entry.paths.add(e.path);
    entry.labels.set(e.attackLabel, (entry.labels.get(e.attackLabel) ?? 0) + 1);
    map.set(e.sourceHash, entry);
  }
  const out: SuspiciousSource[] = [];
  for (const [sourceHash, entry] of map) {
    if (entry.events.length < min) continue;
    const authCount = entry.events.filter(
      (e) => e.eventType === "auth_denied" || e.eventType === "automation_auth_denied",
    ).length;
    const pattern: SuspiciousSource["pattern"] =
      authCount >= min ? "brute_force" : entry.paths.size >= 5 ? "scan" : "flood";
    const times = entry.events.map((e) => e.createdAt).sort();
    const code = countryCode(entry.events.find((e) => e.country)?.country ?? null);
    out.push({
      sourceHash,
      country: countryNameJa(code),
      code,
      count: entry.events.length,
      distinctPaths: entry.paths.size,
      pattern,
      patternLabel:
        pattern === "brute_force"
          ? "総当たりログインの疑い"
          : pattern === "scan"
            ? "脆弱箇所の探索（スキャン）の疑い"
            : "短時間の連続アクセス",
      topLabel: [...entry.labels.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "",
      firstAt: times[0]!,
      lastAt: times[times.length - 1]!,
    });
  }
  return out.sort((a, b) => b.count - a.count).slice(0, options?.limit ?? 10);
}

export function buildAttackInsights(
  events: EventLike[],
  options?: { topN?: number },
): AttackInsightReport {
  const topN = options?.topN ?? 12;
  const codeByName = new Map<string, string | null>();
  const countryLabel = (raw: string | null | undefined) => {
    const code = countryCode(raw);
    const name = countryNameJa(code);
    codeByName.set(name, code);
    return name;
  };
  const flowMap = new Map<string, AttackFlowRow>();
  const countryMap = new Map<string, number>();
  const targetMap = new Map<AttackTargetKind, number>();
  let totalEvents = 0;

  for (const ev of events) {
    const n = Math.max(1, Number(ev.count) || 1);
    totalEvents += n;
    const country = countryLabel(ev.country);
    const path = String(ev.path || "/");
    const kind = classifyAttackTarget(path);
    const reason = String(ev.reason || "").slice(0, 120);
    const key = `${country}::${kind}`;
    const prev = flowMap.get(key);
    if (prev) {
      prev.count += n;
      if (path.length < prev.pathSample.length) prev.pathSample = path;
      if (reason && !prev.reasonSample) prev.reasonSample = reason;
    } else {
      flowMap.set(key, {
        country,
        targetKind: kind,
        targetLabel: TARGET_LABEL[kind],
        pathSample: path,
        reasonSample: reason,
        count: n,
      });
    }
    countryMap.set(country, (countryMap.get(country) || 0) + n);
    targetMap.set(kind, (targetMap.get(kind) || 0) + n);
  }

  const flows = [...flowMap.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, topN);

  const byCountry = [...countryMap.entries()]
    .map(([country, count]) => ({ country, code: codeByName.get(country) ?? null, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  const byTarget = [...targetMap.entries()]
    .map(([targetKind, count]) => ({
      targetKind,
      targetLabel: TARGET_LABEL[targetKind],
      count,
    }))
    .sort((a, b) => b.count - a.count);

  const narrative: string[] = [];
  if (totalEvents === 0) {
    narrative.push(
      "この期間、アプリ層で記録された遮断・不正試行はありません（基盤側で落ちた攻撃はここに出ません）。",
    );
  } else {
    const topCountry = byCountry[0];
    const topTarget = byTarget[0];
    if (topCountry) {
      narrative.push(
        `最多の攻撃元は「${topCountry.country}」（${topCountry.count} 件）です。`,
      );
    }
    if (topTarget) {
      narrative.push(
        `狙われやすい場所は「${topTarget.targetLabel}」（${topTarget.count} 件）です。`,
      );
    }
    const topFlow = flows[0];
    if (topFlow) {
      narrative.push(
        `典型パターン: ${topFlow.country} → ${topFlow.targetLabel}（例: ${topFlow.pathSample}）。`,
      );
    }
  }

  return { flows, byCountry, byTarget, narrative, totalEvents };
}
