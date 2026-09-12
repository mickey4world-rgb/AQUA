"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  RELATION_EDGE_LABELS,
  RELATION_GROUP_BOX_COLORS,
  RELATION_GROUP_BOX_FILLS,
  type RelationEdge,
  type RelationGroupEdge,
  type RelationMapLayout,
  type RelationOrgKind,
  type RelationPerson,
  type RelationWorkspace,
} from "@/lib/types/work-relations";
import {
  displayOrgKind,
  nodeRingColors,
  orgGroupKey,
  orgGroupTitle,
} from "@/lib/work-relations-utils";

type GraphMode = "all" | "asOf";

type OrgBucket = {
  key: string;
  title: string;
  orgKind: RelationOrgKind;
  color: string;
  fill: string;
  members: RelationPerson[];
};

type DragState =
  | {
      kind: "group";
      key: string;
      startX: number;
      startY: number;
      origX: number;
      origY: number;
    }
  | {
      kind: "person";
      id: string;
      groupKey: string;
      startX: number;
      startY: number;
      origX: number;
      origY: number;
    };

const BOX_PAD_X = 14;
const BOX_PAD_TOP = 42;
const BOX_PAD_BOTTOM = 18;
const PERSON_R = 18;
const CELL = 70;
/** グループ関係線専用（所属色・人間関係線と被らない控えめな色） */
const GROUP_EDGE_STROKE = "rgba(120, 130, 148, 0.85)";

function estimateTitleWidth(title: string, memberCount: number): number {
  const label = `${title}（${memberCount}）`;
  // CJK 中心の概算幅（枠内に収めるため）
  return Math.min(460, 28 + [...label].length * 12);
}

function defaultGroupPosition(
  index: number,
  orgKind: RelationOrgKind,
  width: number,
): { x: number; y: number } {
  // 官庁は上段、業者は下段
  if (orgKind === "supreme_court") return { x: 48, y: 48 };
  if (orgKind === "cabinet") return { x: Math.max(360, width * 0.42), y: 48 };
  const col = index % 3;
  const row = Math.floor(index / 3);
  return {
    x: 48 + col * 300,
    y: 300 + row * 230,
  };
}

function boxSize(
  memberCount: number,
  title: string,
): { w: number; h: number } {
  const cols = Math.max(1, Math.ceil(Math.sqrt(memberCount)));
  const rows = Math.max(1, Math.ceil(memberCount / cols));
  return {
    w: Math.max(
      200,
      cols * CELL + BOX_PAD_X * 2,
      estimateTitleWidth(title, memberCount),
    ),
    h: Math.max(120, rows * CELL + BOX_PAD_TOP + BOX_PAD_BOTTOM),
  };
}

function orthogonalPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): string {
  const midY = (y1 + y2) / 2;
  return `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`;
}

function buildBuckets(
  people: RelationPerson[],
  mode: GraphMode,
  asOf: string | null,
): OrgBucket[] {
  const map = new Map<string, OrgBucket>();
  for (const person of people) {
    const key = orgGroupKey(person, mode, asOf);
    const existing = map.get(key);
    if (existing) {
      existing.members.push(person);
      continue;
    }
    const orgKind = displayOrgKind(person, mode, asOf);
    map.set(key, {
      key,
      title: orgGroupTitle(person, mode, asOf),
      orgKind,
      color: RELATION_GROUP_BOX_COLORS[orgKind],
      fill: RELATION_GROUP_BOX_FILLS[orgKind],
      members: [person],
    });
  }
  return [...map.values()].sort((a, b) => {
    const order = (k: RelationOrgKind) =>
      k === "supreme_court" ? 0 : k === "cabinet" ? 1 : k === "vendor" ? 2 : 3;
    const d = order(a.orgKind) - order(b.orgKind);
    if (d !== 0) return d;
    return b.members.length - a.members.length;
  });
}

/** clientLinks から官庁グループ ↔ 業者グループの線を自動生成（官庁同士は結ばない） */
function autoGroupEdges(
  buckets: OrgBucket[],
  people: RelationPerson[],
  mode: GraphMode,
  asOf: string | null,
  manual: RelationGroupEdge[],
): RelationGroupEdge[] {
  const agencyKey = new Map<string, string>();
  const kindByKey = new Map<string, RelationOrgKind>();
  for (const bucket of buckets) {
    kindByKey.set(bucket.key, bucket.orgKind);
    if (bucket.orgKind === "supreme_court") agencyKey.set("supreme_court", bucket.key);
    if (bucket.orgKind === "cabinet") agencyKey.set("cabinet", bucket.key);
  }

  const isAgency = (key: string) => {
    const kind = kindByKey.get(key);
    return kind === "supreme_court" || kind === "cabinet";
  };

  const derived: RelationGroupEdge[] = [];
  const seen = new Set(
    manual.map((e) => `${e.fromGroupKey}->${e.toGroupKey}`),
  );

  for (const person of people) {
    if (displayOrgKind(person, mode, asOf) !== "vendor") continue;
    const vendorKey = orgGroupKey(person, mode, asOf);
    for (const link of person.clientLinks ?? []) {
      const agency = agencyKey.get(link);
      if (!agency) continue;
      const id = `${agency}->${vendorKey}`;
      if (seen.has(id) || seen.has(`${vendorKey}->${agency}`)) continue;
      seen.add(id);
      derived.push({
        id: `auto-${id}`,
        fromGroupKey: agency,
        toGroupKey: vendorKey,
        label: link === "supreme_court" ? "最高裁関連" : "内閣官房関連",
      });
    }
  }

  // 手動線も官庁同士は除外（最高裁↔内閣官房は不要）
  const manualKept = manual.filter(
    (edge) => !(isAgency(edge.fromGroupKey) && isAgency(edge.toGroupKey)),
  );

  return [...manualKept, ...derived];
}

type RelationOrgMapProps = {
  people: RelationPerson[];
  edges: RelationEdge[];
  groupEdges: RelationGroupEdge[];
  layout: RelationMapLayout | null | undefined;
  mode: GraphMode;
  asOf: string | null;
  selectedId: string | null;
  width: number;
  height: number;
  expanded?: boolean;
  className?: string;
  onSelectPerson: (id: string) => void;
  onLayoutChange: (layout: RelationMapLayout) => void;
};

export default function RelationOrgMap({
  people,
  edges,
  groupEdges,
  layout,
  mode,
  asOf,
  selectedId,
  width,
  height,
  expanded = false,
  className,
  onSelectPerson,
  onLayoutChange,
}: RelationOrgMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const initialLayout = layout ?? emptyRelationLayout();
  const [localLayout, setLocalLayout] = useState<RelationMapLayout>(initialLayout);
  const layoutRef = useRef<RelationMapLayout>(initialLayout);
  const dragRef = useRef<DragState | null>(null);
  const [dragVersion, setDragVersion] = useState(0);

  useEffect(() => {
    const next = layout ?? emptyRelationLayout();
    layoutRef.current = next;
    setLocalLayout(next);
  }, [layout]);

  function commitLayout(next: RelationMapLayout) {
    layoutRef.current = next;
    setLocalLayout(next);
    setDragVersion((v) => v + 1);
  }

  const buckets = useMemo(
    () => buildBuckets(people, mode, asOf),
    [people, mode, asOf],
  );

  const vendorIndexByKey = useMemo(() => {
    const map = new Map<string, number>();
    let i = 0;
    for (const bucket of buckets) {
      if (bucket.orgKind === "vendor" || bucket.orgKind === "other") {
        map.set(bucket.key, i);
        i += 1;
      }
    }
    return map;
  }, [buckets]);

  const groupRects = useMemo(() => {
    return buckets.map((bucket) => {
      const size = boxSize(bucket.members.length, bucket.title);
      const saved = localLayout.groupPositions[bucket.key];
      const fallbackIndex =
        bucket.orgKind === "vendor" || bucket.orgKind === "other"
          ? vendorIndexByKey.get(bucket.key) ?? 0
          : 0;
      const pos =
        saved ??
        defaultGroupPosition(fallbackIndex, bucket.orgKind, width);
      return { ...bucket, ...pos, w: size.w, h: size.h };
    });
    // dragVersion forces recompute while dragging
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buckets, localLayout, width, vendorIndexByKey, dragVersion]);

  const personNodes = useMemo(() => {
    const nodes: Array<{
      id: string;
      person: RelationPerson;
      groupKey: string;
      x: number;
      y: number;
      color: string;
      ringColors: string[];
    }> = [];

    for (const group of groupRects) {
      const cols = Math.max(1, Math.ceil(Math.sqrt(group.members.length)));
      group.members.forEach((person, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);
        const offset = localLayout.personOffsets[person.id];
        const baseX = BOX_PAD_X + PERSON_R + col * CELL;
        const baseY = BOX_PAD_TOP + PERSON_R + row * CELL;
        const ox = offset?.x ?? baseX;
        const oy = offset?.y ?? baseY;
        const rings = nodeRingColors(person, mode, asOf);
        nodes.push({
          id: person.id,
          person,
          groupKey: group.key,
          x: group.x + Math.min(Math.max(ox, PERSON_R + 8), group.w - PERSON_R - 8),
          y: group.y + Math.min(Math.max(oy, BOX_PAD_TOP), group.h - PERSON_R - 8),
          color: rings[0] ?? group.color,
          ringColors: rings,
        });
      });
    }
    return nodes;
  }, [groupRects, localLayout.personOffsets, dragVersion, mode, asOf]);

  const personById = useMemo(
    () => new Map(personNodes.map((n) => [n.id, n])),
    [personNodes],
  );
  const groupByKey = useMemo(
    () => new Map(groupRects.map((g) => [g.key, g])),
    [groupRects],
  );

  const allGroupEdges = useMemo(
    () => autoGroupEdges(buckets, people, mode, asOf, groupEdges),
    [buckets, people, mode, asOf, groupEdges],
  );

  function clientToSvg(clientX: number, clientY: number) {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const local = pt.matrixTransform(ctm.inverse());
    return { x: local.x, y: local.y };
  }

  function onPointerDownGroup(
    event: ReactPointerEvent,
    key: string,
    x: number,
    y: number,
  ) {
    event.stopPropagation();
    (event.target as Element).setPointerCapture?.(event.pointerId);
    const p = clientToSvg(event.clientX, event.clientY);
    dragRef.current = {
      kind: "group",
      key,
      startX: p.x,
      startY: p.y,
      origX: x,
      origY: y,
    };
  }

  function onPointerDownPerson(
    event: ReactPointerEvent,
    id: string,
    groupKey: string,
    absX: number,
    absY: number,
  ) {
    event.stopPropagation();
    (event.target as Element).setPointerCapture?.(event.pointerId);
    const group = groupByKey.get(groupKey);
    if (!group) return;
    const p = clientToSvg(event.clientX, event.clientY);
    dragRef.current = {
      kind: "person",
      id,
      groupKey,
      startX: p.x,
      startY: p.y,
      origX: absX - group.x,
      origY: absY - group.y,
    };
    onSelectPerson(id);
  }

  function onPointerMove(event: ReactPointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    const p = clientToSvg(event.clientX, event.clientY);
    const dx = p.x - drag.startX;
    const dy = p.y - drag.startY;

    if (drag.kind === "group") {
      commitLayout({
        ...layoutRef.current,
        groupPositions: {
          ...layoutRef.current.groupPositions,
          [drag.key]: {
            x: Math.max(8, drag.origX + dx),
            y: Math.max(8, drag.origY + dy),
          },
        },
      });
      return;
    }

    const group = groupByKey.get(drag.groupKey);
    if (!group) return;
    commitLayout({
      ...layoutRef.current,
      personOffsets: {
        ...layoutRef.current.personOffsets,
        [drag.id]: {
          x: Math.max(PERSON_R + 8, Math.min(group.w - PERSON_R - 8, drag.origX + dx)),
          y: Math.max(BOX_PAD_TOP, Math.min(group.h - PERSON_R - 8, drag.origY + dy)),
        },
      },
    });
  }

  function onPointerUp() {
    if (!dragRef.current) return;
    dragRef.current = null;
    onLayoutChange(layoutRef.current);
  }

  return (
    <div className={`relative ${className ?? ""}`}>
      <p className="mb-2 text-[11px] text-slate-500">
        組織枠・人をドラッグして配置を変更できます。離すと保存されます。
      </p>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className={`w-full touch-none ${expanded ? "min-h-[70vh] h-full" : "h-[480px]"}`}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        {/* 組織枠 */}
        {groupRects.map((group) => (
          <g
            key={group.key}
            className="cursor-grab active:cursor-grabbing"
            onPointerDown={(e) =>
              onPointerDownGroup(e, group.key, group.x, group.y)
            }
          >
            <rect
              x={group.x}
              y={group.y}
              width={group.w}
              height={group.h}
              rx={14}
              ry={14}
              fill={group.fill}
              stroke={group.color}
              strokeWidth={1.75}
            />
            <text
              x={group.x + BOX_PAD_X}
              y={group.y + 12}
              dominantBaseline="hanging"
              textAnchor="start"
              fontSize="12"
              fontWeight={600}
              fill={group.color}
            >
              {group.title}
              {`（${group.members.length}）`}
            </text>
          </g>
        ))}

        {/* グループ関係線（直角・枠の外側） */}
        {allGroupEdges.map((edge) => {
          const from = groupByKey.get(edge.fromGroupKey);
          const to = groupByKey.get(edge.toGroupKey);
          if (!from || !to) return null;
          const x1 = from.x + from.w / 2;
          const y1 = from.y + from.h;
          const x2 = to.x + to.w / 2;
          const y2 = to.y;
          const d = orthogonalPath(x1, y1, x2, y2);
          return (
            <g key={edge.id}>
              <path
                d={d}
                fill="none"
                stroke={GROUP_EDGE_STROKE}
                strokeWidth={1.4}
              />
              {edge.label ? (
                <text
                  x={(x1 + x2) / 2}
                  y={(y1 + y2) / 2 - 6}
                  textAnchor="middle"
                  fontSize="10"
                  fill="rgba(148, 163, 184, 0.9)"
                >
                  {edge.label}
                </text>
              ) : null}
            </g>
          );
        })}

        {/* 人間関係線 */}
        {edges.map((edge) => {
          const from = personById.get(edge.fromPersonId);
          const to = personById.get(edge.toPersonId);
          if (!from || !to) return null;
          return (
            <g key={edge.id}>
              <line
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke="rgba(226,232,240,0.55)"
                strokeWidth={edge.strength}
              />
              <text
                x={(from.x + to.x) / 2}
                y={(from.y + to.y) / 2 - 6}
                textAnchor="middle"
                fontSize="10"
                className="fill-slate-400"
              >
                {edge.label || RELATION_EDGE_LABELS[edge.kind]}
              </text>
            </g>
          );
        })}

        {/* 要員 */}
        {personNodes.map((node) => {
          const selected = node.id === selectedId;
          return (
            <g
              key={node.id}
              className="cursor-grab active:cursor-grabbing"
              onPointerDown={(e) =>
                onPointerDownPerson(
                  e,
                  node.id,
                  node.groupKey,
                  node.x,
                  node.y,
                )
              }
            >
              {node.person.facePhotoDataUrl ? (
                <>
                  <defs>
                    <clipPath id={`org-face-${node.id}`}>
                      <circle cx={node.x} cy={node.y} r={PERSON_R - 2} />
                    </clipPath>
                  </defs>
                  {node.ringColors.length > 1 ? (
                    <>
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={PERSON_R + 2}
                        fill="none"
                        stroke={node.ringColors[1]}
                        strokeWidth={selected ? 2.5 : 2}
                      />
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={PERSON_R}
                        fill="#0f172a"
                        stroke={node.ringColors[0]}
                        strokeWidth={selected ? 2.5 : 2}
                      />
                    </>
                  ) : (
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={PERSON_R}
                      fill="#0f172a"
                      stroke={node.color}
                      strokeWidth={selected ? 3 : 2}
                    />
                  )}
                  <image
                    href={node.person.facePhotoDataUrl}
                    x={node.x - (PERSON_R - 2)}
                    y={node.y - (PERSON_R - 2)}
                    width={(PERSON_R - 2) * 2}
                    height={(PERSON_R - 2) * 2}
                    clipPath={`url(#org-face-${node.id})`}
                    preserveAspectRatio="xMidYMid slice"
                  />
                </>
              ) : node.ringColors.length > 1 ? (
                <>
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={PERSON_R + 2}
                    fill="none"
                    stroke={node.ringColors[1]}
                    strokeWidth={selected ? 2.5 : 2}
                  />
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={PERSON_R}
                    fill="#0f172a"
                    stroke={node.ringColors[0]}
                    strokeWidth={selected ? 2.5 : 2}
                  />
                </>
              ) : (
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={PERSON_R}
                  fill="#0f172a"
                  stroke={node.color}
                  strokeWidth={selected ? 3 : 2}
                />
              )}
              <text
                x={node.x}
                y={node.y + PERSON_R + 14}
                textAnchor="middle"
                fontSize="11"
                className="fill-slate-100"
              >
                {node.person.name}
              </text>
            </g>
          );
        })}
      </svg>
      {buckets.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">表示する人物がありません。</p>
      ) : null}
    </div>
  );
}

export function emptyRelationLayout(): RelationMapLayout {
  return { groupPositions: {}, personOffsets: {} };
}

export function ensureWorkspaceLayout(
  workspace: RelationWorkspace,
): RelationMapLayout {
  return (
    workspace.layout ?? {
      groupPositions: {},
      personOffsets: {},
    }
  );
}
