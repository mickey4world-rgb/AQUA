/**
 * 週末ユニバースの追加・削除（監視メモへ）を素人向けラベルに変換。
 * create/deactivate などの実装用語を画面に出さない。
 */

export type WeeklyAppliedAction = {
  type: string;
  code: string;
  ok?: boolean;
  detail?: string;
};

export type WeeklyChangeItem = {
  code: string;
  name: string;
  /** 画面用動詞 */
  verb: string;
  /** 追加側 / 外し側 */
  side: "add" | "remove" | "other";
  ok: boolean;
};

const ADD_TYPES = new Set(["create", "activate"]);
const REMOVE_TYPES = new Set(["deactivate", "park"]);

export function weeklyActionVerb(type: string): string {
  switch (type) {
    case "create":
      return "追加（新規登録）";
    case "activate":
      return "追加（アクティブへ）";
    case "deactivate":
      return "外し（監視メモへ）";
    case "park":
      return "外し（監視メモのみ）";
    case "keep":
      return "継続";
    default:
      return type;
  }
}

export function weeklyActionSide(
  type: string,
): WeeklyChangeItem["side"] {
  if (ADD_TYPES.has(type)) return "add";
  if (REMOVE_TYPES.has(type)) return "remove";
  return "other";
}

export function buildWeeklyChangeItems(
  actions: WeeklyAppliedAction[] | undefined | null,
  nameByCode: Map<string, string> | Record<string, string>,
): WeeklyChangeItem[] {
  if (!actions?.length) return [];
  const names =
    nameByCode instanceof Map
      ? nameByCode
      : new Map(Object.entries(nameByCode));

  return actions
    .filter((a) => a.type !== "keep")
    .map((a) => ({
      code: a.code,
      name: names.get(a.code) || a.code,
      verb: weeklyActionVerb(a.type),
      side: weeklyActionSide(a.type),
      ok: a.ok !== false,
    }));
}

/** 候補行バッジ用: code → 今週の変化ラベル */
export function weeklyChangeBadgeByCode(
  items: WeeklyChangeItem[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const item of items) {
    if (!item.ok) continue;
    if (item.side === "add") map.set(item.code, "今週追加");
    else if (item.side === "remove") map.set(item.code, "今週メモへ");
  }
  return map;
}
