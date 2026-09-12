"use client";

import { useEffect, useMemo, useState } from "react";
import { worksPanelClass } from "@/lib/works-utils";
import {
  RELATION_EDGE_KINDS,
  RELATION_EDGE_LABELS,
  RELATION_ORG_KINDS,
  RELATION_ORG_LABELS,
  RELATION_PERSON_STATUSES,
  RELATION_PERSON_STATUS_LABELS,
  type RelationEdge,
  type RelationEdgeKind,
  type RelationMemoParseResult,
  type RelationOrgKind,
  type RelationPerson,
  type RelationPersonStatus,
  type RelationWorkspace,
} from "@/lib/types/work-relations";

type ResidencyInfo = {
  domesticAiReady: boolean;
  dataRegionLabel: string;
  policy: string;
};

type GraphNode = {
  id: string;
  person: RelationPerson;
  x: number;
  y: number;
  vx: number;
  vy: number;
};

const ORG_COLORS: Record<RelationOrgKind, string> = {
  supreme_court: "#7dd3fc",
  cabinet: "#5eead4",
  vendor: "#fcd34d",
  other: "#c4b5fd",
};

function newId() {
  return crypto.randomUUID();
}

function emptyPerson(): RelationPerson {
  return {
    id: newId(),
    name: "",
    orgKind: "other",
    orgName: "",
    title: "",
    status: "active",
    startedOn: null,
    endedOn: null,
    notes: "",
    tags: [],
  };
}

function layoutNodes(
  people: RelationPerson[],
  edges: RelationEdge[],
  width: number,
  height: number,
): GraphNode[] {
  const cx = width / 2;
  const cy = height / 2;
  const nodes: GraphNode[] = people.map((person, index) => {
    const angle = (index / Math.max(people.length, 1)) * Math.PI * 2;
    const radius = Math.min(width, height) * 0.32;
    return {
      id: person.id,
      person,
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
      vx: 0,
      vy: 0,
    };
  });

  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (let iter = 0; iter < 80; iter += 1) {
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i];
        const b = nodes[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dist = Math.hypot(dx, dy) || 1;
        const minDist = 88;
        if (dist < minDist) {
          const force = ((minDist - dist) / dist) * 0.08;
          dx *= force;
          dy *= force;
          a.vx += dx;
          a.vy += dy;
          b.vx -= dx;
          b.vy -= dy;
        }
      }
    }

    for (const edge of edges) {
      const a = byId.get(edge.fromPersonId);
      const b = byId.get(edge.toPersonId);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 1;
      const target = 140 - edge.strength * 18;
      const force = ((dist - target) / dist) * 0.02;
      a.vx += dx * force;
      a.vy += dy * force;
      b.vx -= dx * force;
      b.vy -= dy * force;
    }

    for (const node of nodes) {
      node.vx += (cx - node.x) * 0.004;
      node.vy += (cy - node.y) * 0.004;
      node.vx *= 0.86;
      node.vy *= 0.86;
      node.x = Math.min(width - 40, Math.max(40, node.x + node.vx));
      node.y = Math.min(height - 40, Math.max(40, node.y + node.vy));
    }
  }

  return nodes;
}

export default function RelationWorkspacePanel() {
  const [workspace, setWorkspace] = useState<RelationWorkspace | null>(null);
  const [residency, setResidency] = useState<ResidencyInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [orgFilter, setOrgFilter] = useState<"all" | RelationOrgKind>("all");
  const [activeOnly, setActiveOnly] = useState(true);
  const [draftPerson, setDraftPerson] = useState<RelationPerson>(emptyPerson());
  const [edgeFrom, setEdgeFrom] = useState("");
  const [edgeTo, setEdgeTo] = useState("");
  const [edgeKind, setEdgeKind] = useState<RelationEdgeKind>("meeting");
  const [edgeLabel, setEdgeLabel] = useState("");
  const [memo, setMemo] = useState("");
  const [parseBusy, setParseBusy] = useState(false);
  const [parsePreview, setParsePreview] = useState<RelationMemoParseResult | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/works/relations");
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.message || data.error || "読み込みに失敗しました");
        }
        if (cancelled) return;
        setWorkspace(data.workspace);
        setResidency(data.residency);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "読み込みに失敗しました");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredPeople = useMemo(() => {
    if (!workspace) return [];
    return workspace.people.filter((person) => {
      if (activeOnly && person.status !== "active") return false;
      if (orgFilter !== "all" && person.orgKind !== orgFilter) return false;
      return true;
    });
  }, [workspace, activeOnly, orgFilter]);

  const filteredEdges = useMemo(() => {
    if (!workspace) return [];
    const ids = new Set(filteredPeople.map((person) => person.id));
    return workspace.edges.filter(
      (edge) =>
        ids.has(edge.fromPersonId) &&
        ids.has(edge.toPersonId) &&
        (!activeOnly || !edge.endedOn),
    );
  }, [workspace, filteredPeople, activeOnly]);

  const nodes = useMemo(
    () => layoutNodes(filteredPeople, filteredEdges, 720, 420),
    [filteredPeople, filteredEdges],
  );

  const selected =
    workspace?.people.find((person) => person.id === selectedId) ?? null;
  const [editPerson, setEditPerson] = useState<RelationPerson | null>(null);

  useEffect(() => {
    if (!selected) {
      setEditPerson(null);
      return;
    }
    setEditPerson({ ...selected });
  }, [selected]);

  async function persist(next: RelationWorkspace, message?: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/works/relations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "保存に失敗しました");
      }
      setWorkspace(data.workspace);
      if (message) setNotice(message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  async function addPerson() {
    if (!workspace || !draftPerson.name.trim()) {
      setError("氏名を入力してください");
      return;
    }
    const person = { ...draftPerson, id: newId(), name: draftPerson.name.trim() };
    await persist(
      { ...workspace, people: [...workspace.people, person] },
      "人物を追加しました",
    );
    setDraftPerson(emptyPerson());
    setSelectedId(person.id);
  }

  async function saveSelected() {
    if (!workspace || !editPerson || !editPerson.name.trim()) {
      setError("氏名を入力してください");
      return;
    }
    const people = workspace.people.map((person) =>
      person.id === editPerson.id
        ? { ...editPerson, name: editPerson.name.trim() }
        : person,
    );
    await persist({ ...workspace, people }, "人物を更新しました");
  }

  async function removeSelected() {
    if (!workspace || !editPerson) return;
    if (!window.confirm(`${editPerson.name} を削除しますか？関連する線も消えます。`)) {
      return;
    }
    const people = workspace.people.filter((person) => person.id !== editPerson.id);
    const edges = workspace.edges.filter(
      (edge) =>
        edge.fromPersonId !== editPerson.id && edge.toPersonId !== editPerson.id,
    );
    const events = workspace.events.map((event) => ({
      ...event,
      personIds: event.personIds.filter((id) => id !== editPerson.id),
    }));
    setSelectedId(null);
    await persist({ ...workspace, people, edges, events }, "人物を削除しました");
  }

  async function addEdge() {
    if (!workspace || !edgeFrom || !edgeTo || edgeFrom === edgeTo) {
      setError("関係の双方を選んでください");
      return;
    }
    const edge: RelationEdge = {
      id: newId(),
      fromPersonId: edgeFrom,
      toPersonId: edgeTo,
      kind: edgeKind,
      label: edgeLabel.trim(),
      strength: 2,
      startedOn: null,
      endedOn: null,
      notes: "",
    };
    await persist(
      { ...workspace, edges: [...workspace.edges, edge] },
      "関係を追加しました",
    );
    setEdgeLabel("");
  }

  async function removeEdge(id: string) {
    if (!workspace) return;
    await persist(
      {
        ...workspace,
        edges: workspace.edges.filter((edge) => edge.id !== id),
      },
      "関係を削除しました",
    );
  }

  async function runParse(apply: boolean) {
    setParseBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/works/relations/parse-memo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memo, apply }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "解析に失敗しました");
      }
      setParsePreview(data.result);
      if (apply && data.workspace) {
        setWorkspace(data.workspace);
        setNotice(`メモを反映しました（${data.dataRegion} / ${data.model}）`);
        setMemo("");
        setParsePreview(null);
      } else {
        setNotice(`抽出プレビューを作成しました（${data.dataRegion}）`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "解析に失敗しました");
    } finally {
      setParseBusy(false);
    }
  }

  if (loading) {
    return (
      <div className={`${worksPanelClass} p-6 text-sm text-slate-400`}>
        関係図を読み込み中…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/5 px-4 py-3 text-sm text-emerald-50/90">
        <p className="font-medium text-emerald-100">国内保持ポリシー</p>
        <p className="mt-1 text-[13px] leading-relaxed text-emerald-50/80">
          {residency?.policy ??
            "関係データは Cosmos、メモ解析は日本リージョン Azure OpenAI のみ。"}
        </p>
        <p className="mt-2 font-mono text-[11px] text-emerald-200/70">
          AI: {residency?.domesticAiReady ? "利用可" : "未設定"} ·{" "}
          {residency?.dataRegionLabel ?? "Japan"}
        </p>
      </div>

      {(error || notice) && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            error
              ? "border-rose-300/30 bg-rose-300/10 text-rose-100"
              : "border-sky-300/30 bg-sky-300/10 text-sky-100"
          }`}
        >
          {error ?? notice}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <section className={`${worksPanelClass} overflow-hidden p-4 sm:p-5`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="eyebrow text-sky-200/80">Relationship Map</p>
              <h2 className="mt-1 text-lg text-white">相関図</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[12px]">
              <select
                value={orgFilter}
                onChange={(e) =>
                  setOrgFilter(e.target.value as "all" | RelationOrgKind)
                }
                className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-slate-200"
              >
                <option value="all">すべての所属</option>
                {RELATION_ORG_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {RELATION_ORG_LABELS[kind]}
                  </option>
                ))}
              </select>
              <label className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-2 py-1.5 text-slate-300">
                <input
                  type="checkbox"
                  checked={activeOnly}
                  onChange={(e) => setActiveOnly(e.target.checked)}
                />
                在任のみ
              </label>
              <span className="text-slate-500">
                {filteredPeople.length}人 / {filteredEdges.length}関係
                {saving ? " · 保存中" : ""}
              </span>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto rounded-xl border border-white/8 bg-[#071018]">
            <svg viewBox="0 0 720 420" className="h-[360px] w-full min-w-[560px]">
              {filteredEdges.map((edge) => {
                const from = nodes.find((node) => node.id === edge.fromPersonId);
                const to = nodes.find((node) => node.id === edge.toPersonId);
                if (!from || !to) return null;
                return (
                  <g key={edge.id}>
                    <line
                      x1={from.x}
                      y1={from.y}
                      x2={to.x}
                      y2={to.y}
                      stroke="rgba(148,163,184,0.45)"
                      strokeWidth={edge.strength}
                    />
                    <text
                      x={(from.x + to.x) / 2}
                      y={(from.y + to.y) / 2 - 6}
                      textAnchor="middle"
                      className="fill-slate-500"
                      fontSize="10"
                    >
                      {edge.label || RELATION_EDGE_LABELS[edge.kind]}
                    </text>
                  </g>
                );
              })}
              {nodes.map((node) => {
                const selectedNode = node.id === selectedId;
                const color = ORG_COLORS[node.person.orgKind];
                return (
                  <g
                    key={node.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedId(node.id)}
                  >
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={selectedNode ? 22 : 18}
                      fill="rgba(15,23,42,0.95)"
                      stroke={color}
                      strokeWidth={selectedNode ? 3 : 2}
                    />
                    <text
                      x={node.x}
                      y={node.y + 34}
                      textAnchor="middle"
                      className="fill-slate-200"
                      fontSize="11"
                    >
                      {node.person.name}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-slate-400">
            {RELATION_ORG_KINDS.map((kind) => (
              <span key={kind} className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: ORG_COLORS[kind] }}
                />
                {RELATION_ORG_LABELS[kind]}
              </span>
            ))}
          </div>
        </section>

        <section className="space-y-5">
          <div className={`${worksPanelClass} p-4 sm:p-5`}>
            <h3 className="text-base text-white">人物カード</h3>
            {editPerson ? (
              <div className="mt-3 space-y-3 text-sm">
                <input
                  value={editPerson.name}
                  onChange={(e) =>
                    setEditPerson((prev) =>
                      prev ? { ...prev, name: e.target.value } : prev,
                    )
                  }
                  className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white"
                />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={editPerson.orgKind}
                    onChange={(e) =>
                      setEditPerson((prev) =>
                        prev
                          ? {
                              ...prev,
                              orgKind: e.target.value as RelationOrgKind,
                            }
                          : prev,
                      )
                    }
                    className="rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-slate-200"
                  >
                    {RELATION_ORG_KINDS.map((kind) => (
                      <option key={kind} value={kind}>
                        {RELATION_ORG_LABELS[kind]}
                      </option>
                    ))}
                  </select>
                  <select
                    value={editPerson.status}
                    onChange={(e) =>
                      setEditPerson((prev) =>
                        prev
                          ? {
                              ...prev,
                              status: e.target.value as RelationPersonStatus,
                            }
                          : prev,
                      )
                    }
                    className="rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-slate-200"
                  >
                    {RELATION_PERSON_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {RELATION_PERSON_STATUS_LABELS[status]}
                      </option>
                    ))}
                  </select>
                </div>
                <input
                  value={editPerson.orgName}
                  onChange={(e) =>
                    setEditPerson((prev) =>
                      prev ? { ...prev, orgName: e.target.value } : prev,
                    )
                  }
                  placeholder="所属・部署・会社名"
                  className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white"
                />
                <input
                  value={editPerson.title}
                  onChange={(e) =>
                    setEditPerson((prev) =>
                      prev ? { ...prev, title: e.target.value } : prev,
                    )
                  }
                  placeholder="役職"
                  className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white"
                />
                <textarea
                  value={editPerson.notes}
                  onChange={(e) =>
                    setEditPerson((prev) =>
                      prev ? { ...prev, notes: e.target.value } : prev,
                    )
                  }
                  rows={4}
                  placeholder="事実メモ（評価・噂は書かない）"
                  className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={saveSelected}
                    className="rounded-lg border border-sky-300/30 bg-sky-300/10 px-3 py-2 text-sky-50"
                  >
                    変更を保存
                  </button>
                  <button
                    type="button"
                    onClick={removeSelected}
                    className="rounded-lg border border-rose-300/30 px-3 py-2 text-rose-100 hover:bg-rose-300/10"
                  >
                    削除
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-400">
                相関図のノード、または下の一覧から人物を選んでください。
              </p>
            )}
          </div>

          <div className={`${worksPanelClass} p-4 sm:p-5`}>
            <h3 className="text-base text-white">人物を追加</h3>
            <div className="mt-3 space-y-2">
              <input
                value={draftPerson.name}
                onChange={(e) =>
                  setDraftPerson((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="氏名"
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={draftPerson.orgKind}
                  onChange={(e) =>
                    setDraftPerson((prev) => ({
                      ...prev,
                      orgKind: e.target.value as RelationOrgKind,
                    }))
                  }
                  className="rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-sm text-slate-200"
                >
                  {RELATION_ORG_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {RELATION_ORG_LABELS[kind]}
                    </option>
                  ))}
                </select>
                <input
                  value={draftPerson.title}
                  onChange={(e) =>
                    setDraftPerson((prev) => ({ ...prev, title: e.target.value }))
                  }
                  placeholder="役職"
                  className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                />
              </div>
              <input
                value={draftPerson.orgName}
                onChange={(e) =>
                  setDraftPerson((prev) => ({ ...prev, orgName: e.target.value }))
                }
                placeholder="所属・会社"
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
              />
              <button
                type="button"
                onClick={addPerson}
                className="rounded-lg border border-sky-300/30 bg-sky-300/10 px-3 py-2 text-sm text-sky-50 hover:bg-sky-300/20"
              >
                追加して保存
              </button>
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className={`${worksPanelClass} p-4 sm:p-5`}>
          <h3 className="text-base text-white">関係を追加</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <select
              value={edgeFrom}
              onChange={(e) => setEdgeFrom(e.target.value)}
              className="rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-sm text-slate-200"
            >
              <option value="">From</option>
              {workspace?.people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
            <select
              value={edgeTo}
              onChange={(e) => setEdgeTo(e.target.value)}
              className="rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-sm text-slate-200"
            >
              <option value="">To</option>
              {workspace?.people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
            <select
              value={edgeKind}
              onChange={(e) => setEdgeKind(e.target.value as RelationEdgeKind)}
              className="rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-sm text-slate-200"
            >
              {RELATION_EDGE_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {RELATION_EDGE_LABELS[kind]}
                </option>
              ))}
            </select>
            <input
              value={edgeLabel}
              onChange={(e) => setEdgeLabel(e.target.value)}
              placeholder="ラベル（任意）"
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            />
          </div>
          <button
            type="button"
            onClick={addEdge}
            className="mt-3 rounded-lg border border-teal-300/30 bg-teal-300/10 px-3 py-2 text-sm text-teal-50"
          >
            関係を保存
          </button>
          <ul className="mt-4 max-h-48 space-y-2 overflow-y-auto text-sm text-slate-300">
            {workspace?.edges.map((edge) => {
              const from = workspace.people.find((p) => p.id === edge.fromPersonId);
              const to = workspace.people.find((p) => p.id === edge.toPersonId);
              return (
                <li
                  key={edge.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-white/8 px-3 py-2"
                >
                  <span>
                    {from?.name ?? "?"} → {to?.name ?? "?"} ·{" "}
                    {edge.label || RELATION_EDGE_LABELS[edge.kind]}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeEdge(edge.id)}
                    className="text-[11px] text-rose-200/80"
                  >
                    削除
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className={`${worksPanelClass} p-4 sm:p-5`}>
          <h3 className="text-base text-white">メモから AI 抽出（国内限定）</h3>
          <p className="mt-2 text-[13px] leading-relaxed text-slate-400">
            打合せメモや異動メモを貼ると、人物・関係・出来事の候補を日本リージョン
            Azure OpenAI だけで抽出します。海外モデルや Gemini は使いません。
          </p>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            rows={7}
            placeholder="例）4月から内閣官房の〇〇さんが窓口。業者は△△社の□□さん。先日の打合せで司法DXの××さんを紹介された。"
            className="mt-3 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={parseBusy || !residency?.domesticAiReady}
              onClick={() => runParse(false)}
              className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-slate-100 disabled:opacity-40"
            >
              {parseBusy ? "解析中…" : "プレビュー"}
            </button>
            <button
              type="button"
              disabled={parseBusy || !residency?.domesticAiReady}
              onClick={() => runParse(true)}
              className="rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-sm text-amber-50 disabled:opacity-40"
            >
              抽出して反映
            </button>
          </div>
          {parsePreview && (
            <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3 text-[12px] text-slate-300">
              <p className="text-slate-200">{parsePreview.summary || "抽出結果"}</p>
              <p className="mt-2">
                人物 {parsePreview.people.length} / 関係 {parsePreview.edges.length} /
                出来事 {parsePreview.events.length}
              </p>
              <ul className="mt-2 space-y-1">
                {parsePreview.people.slice(0, 8).map((person) => (
                  <li key={`${person.name}-${person.orgName}`}>
                    · {person.name}（{RELATION_ORG_LABELS[person.orgKind]} /{" "}
                    {person.title || "役職不明"}）
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      <section className={`${worksPanelClass} p-4 sm:p-5`}>
        <h3 className="text-base text-white">登録一覧</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {workspace?.people.map((person) => (
            <button
              key={person.id}
              type="button"
              onClick={() => setSelectedId(person.id)}
              className={`rounded-xl border px-3 py-3 text-left transition ${
                selectedId === person.id
                  ? "border-sky-300/40 bg-sky-300/10"
                  : "border-white/8 bg-white/[0.02] hover:border-white/20"
              }`}
            >
              <p className="text-sm text-white">{person.name}</p>
              <p className="mt-1 text-[11px] text-slate-400">
                {RELATION_ORG_LABELS[person.orgKind]} · {person.orgName || "所属未設定"}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                {RELATION_PERSON_STATUS_LABELS[person.status]} · {person.title || "—"}
              </p>
            </button>
          ))}
          {!workspace?.people.length && (
            <p className="text-sm text-slate-500">まだ人物がありません。</p>
          )}
        </div>
      </section>
    </div>
  );
}
