"use client";

import { useCallback, useEffect, useState } from "react";
import ConsultPanel from "@/components/works/ConsultPanel";
import WorkNotesPanel from "@/components/works/WorkNotesPanel";
import type { WorkNote } from "@/lib/types/works";

export default function ConsultWorkspace() {
  const [notes, setNotes] = useState<WorkNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
      <ConsultPanel onNoteSaved={handleSaved} />
      <WorkNotesPanel
        notes={notes}
        loading={loading}
        error={error}
        onDeleted={handleDeleted}
      />
    </div>
  );
}
