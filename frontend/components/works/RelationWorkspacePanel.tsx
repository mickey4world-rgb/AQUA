"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import RelationFaceCropModal from "@/components/works/RelationFaceCropModal";
import { worksPanelClass } from "@/lib/works-utils";
import {
  affiliationAt,
  displayOrgKind,
  displayOrgLabel,
  edgeVisibleAt,
  emptyAffiliation,
  formatAffiliationPeriod,
  nodeRingColors,
  personVisibleAt,
  RELATION_ORG_COLORS,
} from "@/lib/work-relations-utils";
import {
  RELATION_CLIENT_LINK_KINDS,
  RELATION_CLIENT_LINK_LABELS,
  RELATION_EDGE_KINDS,
  RELATION_EDGE_LABELS,
  RELATION_ORG_KINDS,
  RELATION_ORG_LABELS,
  RELATION_PERSON_STATUSES,
  RELATION_PERSON_STATUS_LABELS,
  type RelationAffiliation,
  type RelationCardScanResult,
  type RelationClientLinkKind,
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

type GraphMode = "all" | "asOf";

type GraphNode = {
  id: string;
  person: RelationPerson;
  orgKind: RelationOrgKind;
  ringColors: string[];
  label: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
};

function newId() {
  return crypto.randomUUID();
}

function emptyPerson(): RelationPerson {
  const aff = emptyAffiliation({ orgKind: "other", startedOn: null, endedOn: null });
  return {
    id: newId(),
    name: "",
    orgKind: "other",
    orgName: "",
    title: "",
    email: "",
    phone: "",
    status: "active",
    startedOn: null,
    endedOn: null,
    affiliations: [aff],
    clientLinks: [],
    facePhotoDataUrl: null,
    notes: "",
    tags: [],
  };
}

function layoutNodes(
  people: RelationPerson[],
  edges: RelationEdge[],
  mode: GraphMode,
  asOf: string | null,
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
      orgKind: displayOrgKind(person, mode, asOf),
      ringColors: nodeRingColors(person, mode, asOf),
      label: displayOrgLabel(person, mode, asOf),
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

async function compressImageFile(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const maxSide = 1280;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("画像キャンバスを初期化できませんでした");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.72);
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
  const [graphMode, setGraphMode] = useState<GraphMode>("all");
  const [asOfDate, setAsOfDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
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
  const [cardBusy, setCardBusy] = useState(false);
  const [cardPreview, setCardPreview] = useState<RelationCardScanResult | null>(
    null,
  );
  const [cardThumb, setCardThumb] = useState<string | null>(null);
  const [faceCropOpen, setFaceCropOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [editPerson, setEditPerson] = useState<RelationPerson | null>(null);

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

  const selected =
    workspace?.people.find((person) => person.id === selectedId) ?? null;

  useEffect(() => {
    if (!selected) {
      setEditPerson(null);
      return;
    }
    setEditPerson({
      ...selected,
      clientLinks: [...(selected.clientLinks ?? [])],
      facePhotoDataUrl: selected.facePhotoDataUrl ?? null,
      affiliations:
        selected.affiliations?.length > 0
          ? selected.affiliations.map((a) => ({ ...a }))
          : [
              emptyAffiliation({
                orgKind: selected.orgKind,
                orgName: selected.orgName,
                title: selected.title,
                email: selected.email,
                phone: selected.phone,
              }),
            ],
    });
  }, [selected]);

  const asOf = graphMode === "asOf" ? asOfDate : null;

  const filteredPeople = useMemo(() => {
    if (!workspace) return [];
    return workspace.people.filter((person) => {
      if (!personVisibleAt(person, graphMode, asOf)) return false;
      if (orgFilter === "all") return true;
      const kind = displayOrgKind(person, graphMode, asOf);
      if (kind === orgFilter) return true;
      if (
        kind === "vendor" &&
        (orgFilter === "supreme_court" || orgFilter === "cabinet") &&
        (person.clientLinks ?? []).includes(orgFilter)
      ) {
        return true;
      }
      return false;
    });
  }, [workspace, graphMode, asOf, orgFilter]);

  const filteredEdges = useMemo(() => {
    if (!workspace) return [];
    const ids = new Set(filteredPeople.map((person) => person.id));
    return workspace.edges.filter(
      (edge) =>
        ids.has(edge.fromPersonId) &&
        ids.has(edge.toPersonId) &&
        edgeVisibleAt(edge, graphMode, asOf),
    );
  }, [workspace, filteredPeople, graphMode, asOf]);

  const nodes = useMemo(
    () => layoutNodes(filteredPeople, filteredEdges, graphMode, asOf, 720, 420),
    [filteredPeople, filteredEdges, graphMode, asOf],
  );

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

  async function addPerson(person: RelationPerson, message = "人物を追加しました") {
    if (!workspace || !person.name.trim()) {
      setError("氏名を入力してください");
      return;
    }
    const nextPerson = { ...person, id: person.id || newId(), name: person.name.trim() };
    await persist(
      { ...workspace, people: [...workspace.people, nextPerson] },
      message,
    );
    setSelectedId(nextPerson.id);
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

  function patchAffiliation(id: string, patch: Partial<RelationAffiliation>) {
    setEditPerson((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        affiliations: prev.affiliations.map((aff) =>
          aff.id === id ? { ...aff, ...patch } : aff,
        ),
      };
    });
  }

  function addAffiliationRow() {
    setEditPerson((prev) => {
      if (!prev) return prev;
      const current = affiliationAt(prev, null);
      return {
        ...prev,
        affiliations: [
          ...prev.affiliations.map((aff) =>
            !aff.endedOn
              ? {
                  ...aff,
                  endedOn: new Date().toISOString().slice(0, 7),
                }
              : aff,
          ),
          emptyAffiliation({
            orgKind: "other",
            startedOn: new Date().toISOString().slice(0, 7),
            endedOn: null,
            email: current?.email ?? prev.email,
            phone: current?.phone ?? prev.phone,
          }),
        ],
        status: "transferred",
      };
    });
  }

  function removeAffiliationRow(id: string) {
    setEditPerson((prev) => {
      if (!prev || prev.affiliations.length <= 1) return prev;
      return {
        ...prev,
        affiliations: prev.affiliations.filter((aff) => aff.id !== id),
      };
    });
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

  async function onCardFile(file: File | null) {
    if (!file) return;
    setCardBusy(true);
    setError(null);
    setNotice(null);
    setCardPreview(null);
    try {
      const dataUrl = await compressImageFile(file);
      setCardThumb(dataUrl);
      const res = await fetch("/api/works/relations/scan-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl: dataUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "名刺の読み取りに失敗しました");
      }
      setCardPreview(data.result);
      setNotice(
        `名刺を読み取りました（${data.dataRegion} / 信頼度 ${data.result.confidence}）`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "名刺スキャンに失敗しました");
    } finally {
      setCardBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function applyCardPreview() {
    if (!cardPreview || !workspace) return;
    const aff = emptyAffiliation({
      orgKind: cardPreview.orgKind,
      orgName: cardPreview.orgName,
      unitName: cardPreview.unitName,
      title: cardPreview.title,
      email: cardPreview.email,
      phone: cardPreview.phone,
      startedOn: new Date().toISOString().slice(0, 7),
      endedOn: null,
      notes: cardPreview.notes,
    });
    const person: RelationPerson = {
      ...emptyPerson(),
      name: cardPreview.name || cardPreview.orgName,
      orgKind: cardPreview.orgKind,
      orgName: cardPreview.orgName,
      title: cardPreview.title,
      email: cardPreview.email,
      phone: cardPreview.phone,
      affiliations: [aff],
      notes: cardPreview.notes,
    };
    await addPerson(person, "名刺から人物を登録しました");
    setCardPreview(null);
    setCardThumb(null);
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
            "関係データは Cosmos、AI は日本リージョン Azure OpenAI のみ。"}
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

      <section className={`${worksPanelClass} p-4 sm:p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow text-amber-200/80">Mobile Capture</p>
            <h2 className="mt-1 text-lg text-white">名刺を撮影して取り込み</h2>
            <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-slate-400">
              スマホではカメラが起動します。日本リージョン Azure OpenAI
              Vision で氏名・組織・部署・役職・メール等を抽出し、所属種別も自動判定します。読めない場合は失敗表示します（空登録しません）。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => onCardFile(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              disabled={cardBusy || !residency?.domesticAiReady}
              onClick={() => fileRef.current?.click()}
              className="rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-sm text-amber-50 disabled:opacity-40"
            >
              {cardBusy ? "読み取り中…" : "カメラ / 画像を選択"}
            </button>
          </div>
        </div>
        {(cardThumb || cardPreview) && (
          <div className="mt-4 grid gap-4 md:grid-cols-[160px_1fr]">
            {cardThumb && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cardThumb}
                alt="名刺プレビュー"
                className="h-36 w-full rounded-xl object-cover border border-white/10"
              />
            )}
            {cardPreview && (
              <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-slate-200">
                <p>
                  {cardPreview.name || "（氏名不明）"} ·{" "}
                  {RELATION_ORG_LABELS[cardPreview.orgKind]}
                </p>
                <p className="mt-1 text-slate-400">
                  {[cardPreview.orgName, cardPreview.unitName, cardPreview.title]
                    .filter(Boolean)
                    .join(" / ") || "組織情報なし"}
                </p>
                <p className="mt-1 text-slate-400">
                  {[cardPreview.email, cardPreview.phone].filter(Boolean).join(" · ") ||
                    "連絡先なし"}
                </p>
                <button
                  type="button"
                  onClick={applyCardPreview}
                  className="mt-3 rounded-lg border border-sky-300/30 bg-sky-300/10 px-3 py-2 text-sky-50"
                >
                  この内容で人物登録
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <section className={`${worksPanelClass} overflow-hidden p-4 sm:p-5`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="eyebrow text-sky-200/80">Relationship Map</p>
              <h2 className="mt-1 text-lg text-white">相関図</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[12px]">
              <select
                value={graphMode}
                onChange={(e) => setGraphMode(e.target.value as GraphMode)}
                className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-slate-200"
              >
                <option value="all">全員表示</option>
                <option value="asOf">時点で表示</option>
              </select>
              {graphMode === "asOf" && (
                <input
                  type="date"
                  value={asOfDate}
                  onChange={(e) => setAsOfDate(e.target.value)}
                  className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-slate-200"
                />
              )}
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
              <span className="text-slate-500">
                {filteredPeople.length}人 / {filteredEdges.length}関係
                {saving ? " · 保存中" : ""}
              </span>
            </div>
          </div>
          {graphMode === "asOf" && (
            <p className="mt-2 text-[12px] text-slate-500">
              {asOfDate} 時点で所属が有効な人物だけを表示し、色は当時の所属種別です。
            </p>
          )}

          <div className="mt-4 overflow-x-auto rounded-xl border border-white/8 bg-[#071018]">
            <svg viewBox="0 0 720 420" className="h-[360px] w-full min-w-[560px]">
              <defs>
                {nodes.map((node) =>
                  node.person.facePhotoDataUrl ? (
                    <clipPath key={`clip-${node.id}`} id={`face-clip-${node.id}`}>
                      <circle cx={node.x} cy={node.y} r={16} />
                    </clipPath>
                  ) : null,
                )}
              </defs>
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
                const colors = node.ringColors;
                const r = selectedNode ? 22 : 18;
                return (
                  <g
                    key={node.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedId(node.id)}
                  >
                    {colors.length <= 1 ? (
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={r}
                        fill="rgba(15,23,42,0.95)"
                        stroke={colors[0] ?? RELATION_ORG_COLORS.other}
                        strokeWidth={selectedNode ? 3 : 2.5}
                      />
                    ) : (
                      <>
                        <circle
                          cx={node.x}
                          cy={node.y}
                          r={r}
                          fill="rgba(15,23,42,0.95)"
                          stroke={RELATION_ORG_COLORS.vendor}
                          strokeWidth={1}
                        />
                        {colors.map((color, index) => {
                          const start = (index / colors.length) * Math.PI * 2 - Math.PI / 2;
                          const end =
                            ((index + 1) / colors.length) * Math.PI * 2 - Math.PI / 2;
                          const x1 = node.x + Math.cos(start) * r;
                          const y1 = node.y + Math.sin(start) * r;
                          const x2 = node.x + Math.cos(end) * r;
                          const y2 = node.y + Math.sin(end) * r;
                          const large = end - start > Math.PI ? 1 : 0;
                          return (
                            <path
                              key={`${node.id}-arc-${color}`}
                              d={`M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`}
                              fill="none"
                              stroke={color}
                              strokeWidth={selectedNode ? 4 : 3}
                              strokeLinecap="butt"
                            />
                          );
                        })}
                      </>
                    )}
                    {node.person.facePhotoDataUrl ? (
                      <image
                        href={node.person.facePhotoDataUrl}
                        x={node.x - 16}
                        y={node.y - 16}
                        width={32}
                        height={32}
                        clipPath={`url(#face-clip-${node.id})`}
                        preserveAspectRatio="xMidYMid slice"
                      />
                    ) : null}
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
                  style={{ background: RELATION_ORG_COLORS[kind] }}
                />
                {RELATION_ORG_LABELS[kind]}
              </span>
            ))}
            <span className="text-slate-500">
              業者の両官庁関連は最高裁色＋内閣官房色のリング
            </span>
          </div>
        </section>

        <section className="space-y-5">
          <div className={`${worksPanelClass} p-4 sm:p-5`}>
            <h3 className="text-base text-white">人物・所属履歴</h3>
            {editPerson ? (
              <div className="mt-3 space-y-3 text-sm">
                <div className="flex items-start gap-3">
                  <div className="shrink-0">
                    {editPerson.facePhotoDataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={editPerson.facePhotoDataUrl}
                        alt={`${editPerson.name}の顔写真`}
                        className="h-16 w-16 rounded-full border-2 object-cover"
                        style={{
                          borderColor:
                            RELATION_ORG_COLORS[
                              displayOrgKind(editPerson, "all", null)
                            ],
                        }}
                      />
                    ) : (
                      <div
                        className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-white/20 text-[10px] text-slate-500"
                      >
                        No face
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <input
                      value={editPerson.name}
                      onChange={(e) =>
                        setEditPerson((prev) =>
                          prev ? { ...prev, name: e.target.value } : prev,
                        )
                      }
                      className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setFaceCropOpen(true)}
                        className="rounded-lg border border-amber-300/30 bg-amber-300/10 px-2.5 py-1.5 text-[12px] text-amber-50"
                      >
                        顔写真を切り出し登録
                      </button>
                      {editPerson.facePhotoDataUrl && (
                        <button
                          type="button"
                          onClick={() =>
                            setEditPerson((prev) =>
                              prev ? { ...prev, facePhotoDataUrl: null } : prev,
                            )
                          }
                          className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[12px] text-slate-300"
                        >
                          顔写真を削除
                        </button>
                      )}
                    </div>
                  </div>
                </div>

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
                  className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-slate-200"
                >
                  {RELATION_PERSON_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {RELATION_PERSON_STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>

                <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <p className="text-[12px] text-slate-400">
                    関連官庁（業者向け・複数可）
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    最高裁と内閣官房の両方に関わる場合は両方チェック。相関図では両色リングで均一表示します。
                  </p>
                  <div className="mt-2 flex flex-wrap gap-3">
                    {RELATION_CLIENT_LINK_KINDS.map((link) => {
                      const checked = (editPerson.clientLinks ?? []).includes(link);
                      return (
                        <label
                          key={link}
                          className="inline-flex items-center gap-2 text-[12px] text-slate-200"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setEditPerson((prev) => {
                                if (!prev) return prev;
                                const current = prev.clientLinks ?? [];
                                const next: RelationClientLinkKind[] = checked
                                  ? current.filter((item) => item !== link)
                                  : [...current, link];
                                return { ...prev, clientLinks: next };
                              });
                            }}
                          />
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full"
                            style={{ background: RELATION_ORG_COLORS[link] }}
                          />
                          {RELATION_CLIENT_LINK_LABELS[link]}
                        </label>
                      );
                    })}
                  </div>
                </div>

                <textarea
                  value={editPerson.notes}
                  onChange={(e) =>
                    setEditPerson((prev) =>
                      prev ? { ...prev, notes: e.target.value } : prev,
                    )
                  }
                  rows={2}
                  placeholder="人物メモ（事実のみ）"
                  className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white"
                />

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[12px] uppercase tracking-wide text-slate-500">
                      所属・在籍期間
                    </p>
                    <button
                      type="button"
                      onClick={addAffiliationRow}
                      className="text-[12px] text-sky-200"
                    >
                      + 異動を追加
                    </button>
                  </div>
                  {editPerson.affiliations.map((aff) => (
                    <div
                      key={aff.id}
                      className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-2"
                    >
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={aff.orgKind}
                          onChange={(e) =>
                            patchAffiliation(aff.id, {
                              orgKind: e.target.value as RelationOrgKind,
                            })
                          }
                          className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-slate-200"
                        >
                          {RELATION_ORG_KINDS.map((kind) => (
                            <option key={kind} value={kind}>
                              {RELATION_ORG_LABELS[kind]}
                            </option>
                          ))}
                        </select>
                        <input
                          value={aff.title}
                          onChange={(e) =>
                            patchAffiliation(aff.id, { title: e.target.value })
                          }
                          placeholder="役職"
                          className="rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-white"
                        />
                      </div>
                      <input
                        value={aff.orgName}
                        onChange={(e) =>
                          patchAffiliation(aff.id, { orgName: e.target.value })
                        }
                        placeholder="組織名（異動先・会社名）"
                        className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-white"
                      />
                      <input
                        value={aff.unitName}
                        onChange={(e) =>
                          patchAffiliation(aff.id, { unitName: e.target.value })
                        }
                        placeholder="部署・室・チーム"
                        className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-white"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <label className="space-y-1 text-[10px] text-slate-500">
                          在籍開始
                          <input
                            type="date"
                            value={
                              aff.startedOn && aff.startedOn.length >= 10
                                ? aff.startedOn.slice(0, 10)
                                : aff.startedOn
                                  ? `${aff.startedOn.slice(0, 7)}-01`
                                  : ""
                            }
                            onChange={(e) =>
                              patchAffiliation(aff.id, {
                                startedOn: e.target.value || null,
                              })
                            }
                            className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-[12px] text-slate-200"
                          />
                        </label>
                        <label className="space-y-1 text-[10px] text-slate-500">
                          在籍終了（空＝現在在籍）
                          <input
                            type="date"
                            value={
                              aff.endedOn && aff.endedOn.length >= 10
                                ? aff.endedOn.slice(0, 10)
                                : aff.endedOn
                                  ? `${aff.endedOn.slice(0, 7)}-01`
                                  : ""
                            }
                            onChange={(e) =>
                              patchAffiliation(aff.id, {
                                endedOn: e.target.value || null,
                              })
                            }
                            className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-[12px] text-slate-200"
                          />
                        </label>
                      </div>
                      <p className="text-[11px] text-sky-200/70">
                        期間: {formatAffiliationPeriod(aff.startedOn, aff.endedOn)}
                      </p>
                      <input
                        value={aff.email}
                        onChange={(e) =>
                          patchAffiliation(aff.id, { email: e.target.value })
                        }
                        placeholder="メールアドレス"
                        className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-white"
                      />
                      <input
                        value={aff.phone}
                        onChange={(e) =>
                          patchAffiliation(aff.id, { phone: e.target.value })
                        }
                        placeholder="電話番号"
                        className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-white"
                      />
                      {editPerson.affiliations.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeAffiliationRow(aff.id)}
                          className="text-[11px] text-rose-200/80"
                        >
                          この所属行を削除
                        </button>
                      )}
                    </div>
                  ))}
                </div>

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
                    className="rounded-lg border border-rose-300/30 px-3 py-2 text-rose-100"
                  >
                    削除
                  </button>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-400">
                相関図または一覧から人物を選ぶと、顔写真・在籍期間・関連官庁を編集できます。
              </p>
            )}
          </div>

          <div className={`${worksPanelClass} p-4 sm:p-5`}>
            <h3 className="text-base text-white">手入力で追加</h3>
            <div className="mt-3 space-y-2">
              <input
                value={draftPerson.name}
                onChange={(e) =>
                  setDraftPerson((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="氏名"
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
              />
              <select
                value={draftPerson.affiliations[0]?.orgKind ?? "other"}
                onChange={(e) =>
                  setDraftPerson((prev) => ({
                    ...prev,
                    orgKind: e.target.value as RelationOrgKind,
                    affiliations: [
                      {
                        ...prev.affiliations[0],
                        orgKind: e.target.value as RelationOrgKind,
                      },
                    ],
                  }))
                }
                className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-2 text-sm text-slate-200"
              >
                {RELATION_ORG_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {RELATION_ORG_LABELS[kind]}
                  </option>
                ))}
              </select>
              <input
                value={draftPerson.affiliations[0]?.orgName ?? ""}
                onChange={(e) =>
                  setDraftPerson((prev) => ({
                    ...prev,
                    orgName: e.target.value,
                    affiliations: [
                      { ...prev.affiliations[0], orgName: e.target.value },
                    ],
                  }))
                }
                placeholder="組織名"
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
              />
              <input
                value={draftPerson.affiliations[0]?.unitName ?? ""}
                onChange={(e) =>
                  setDraftPerson((prev) => ({
                    ...prev,
                    affiliations: [
                      { ...prev.affiliations[0], unitName: e.target.value },
                    ],
                  }))
                }
                placeholder="部署・所属"
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
              />
              <input
                value={draftPerson.affiliations[0]?.email ?? ""}
                onChange={(e) =>
                  setDraftPerson((prev) => ({
                    ...prev,
                    email: e.target.value,
                    affiliations: [
                      { ...prev.affiliations[0], email: e.target.value },
                    ],
                  }))
                }
                placeholder="メール"
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
              />
              <button
                type="button"
                onClick={() => {
                  void addPerson(draftPerson);
                  setDraftPerson(emptyPerson());
                }}
                className="rounded-lg border border-sky-300/30 bg-sky-300/10 px-3 py-2 text-sm text-sky-50"
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
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            rows={7}
            placeholder="例）令和7年4月、〇〇さんは最高裁から内閣官房へ異動。窓口メールは …"
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
            </div>
          )}
        </section>
      </div>

      <section className={`${worksPanelClass} p-4 sm:p-5`}>
        <h3 className="text-base text-white">登録一覧</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {workspace?.people.map((person) => {
            const current = affiliationAt(person, null);
            return (
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
                <div className="flex items-start gap-3">
                  {person.facePhotoDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={person.facePhotoDataUrl}
                      alt=""
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    <span
                      className="mt-1 inline-block h-2.5 w-2.5 rounded-full"
                      style={{
                        background:
                          RELATION_ORG_COLORS[current?.orgKind ?? person.orgKind],
                      }}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white">{person.name}</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {RELATION_ORG_LABELS[current?.orgKind ?? person.orgKind]} ·{" "}
                      {[current?.orgName, current?.unitName]
                        .filter(Boolean)
                        .join(" / ") || "所属未設定"}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      {formatAffiliationPeriod(
                        current?.startedOn ?? null,
                        current?.endedOn ?? null,
                      )}
                    </p>
                    {(person.clientLinks?.length ?? 0) > 0 && (
                      <p className="mt-1 flex flex-wrap gap-1">
                        {person.clientLinks.map((link) => (
                          <span
                            key={link}
                            className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-slate-300"
                          >
                            <span
                              className="inline-block h-1.5 w-1.5 rounded-full"
                              style={{ background: RELATION_ORG_COLORS[link] }}
                            />
                            {RELATION_CLIENT_LINK_LABELS[link]}
                          </span>
                        ))}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
          {!workspace?.people.length && (
            <p className="text-sm text-slate-500">まだ人物がありません。</p>
          )}
        </div>
      </section>

      <RelationFaceCropModal
        open={faceCropOpen}
        onClose={() => setFaceCropOpen(false)}
        onConfirm={(faceDataUrl) => {
          setEditPerson((prev) =>
            prev ? { ...prev, facePhotoDataUrl: faceDataUrl } : prev,
          );
          setNotice("顔写真を切り出しました。変更を保存してください。");
        }}
      />
    </div>
  );
}
