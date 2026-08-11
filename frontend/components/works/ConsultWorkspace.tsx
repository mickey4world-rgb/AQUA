"use client";

import { useCallback, useEffect, useState } from "react";
import ConsultPanel from "@/components/works/ConsultPanel";
import ConsultVisualViewer from "@/components/works/ConsultVisualViewer";
import WorkNotesPanel from "@/components/works/WorkNotesPanel";
import type { ConsultVisualDocument } from "@/lib/types/consult-visual";
import type { WorkNote } from "@/lib/types/works";

export default function ConsultWorkspace() {
  const [notes, setNotes] = useState<WorkNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visual, setVisual] = useState<ConsultVisualDocument | null>(null);
  const [visualLoading, setVisualLoading] = useState(false);
  const [lastReply, setLastReply] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const res = await fetch("/api/works/notes");
        if (!active) return;

        if (res.status === 503) {
          setError("Cosmos DB が未設定のため、保存機能は利用できません（.md 出力は利用可能）。");
          return;
        }
        if (!res.ok) {
          setError("メモの読み込みに失敗しました");
          return;
        }

        const data = await res.json();
        setNotes((data.notes as WorkNote[]) ?? []);
      } catch {
        if (active) setError("メモの読み込みに失敗しました");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, []);

  const handleSaved = useCallback((note: WorkNote) => {
    setNotes((prev) => [note, ...prev]);
    setError(null);
  }, []);

  const handleDeleted = useCallback((id: string) => {
    setNotes((prev) => prev.filter((note) => note.id !== id));
  }, []);

  const handleVisualUpdate = useCallback(
    (payload: {
      visual: ConsultVisualDocument | null;
      reply: string | null;
      loading: boolean;
    }) => {
      setVisual(payload.visual);
      setLastReply(payload.reply);
      setVisualLoading(payload.loading);
    },
    [],
  );

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-2">
        <ConsultPanel onNoteSaved={handleSaved} onVisualUpdate={handleVisualUpdate} />
        <ConsultVisualViewer visual={visual} reply={lastReply} loading={visualLoading} />
      </div>
      <WorkNotesPanel
        notes={notes}
        loading={loading}
        error={error}
        onDeleted={handleDeleted}
      />
    </div>
  );
}
