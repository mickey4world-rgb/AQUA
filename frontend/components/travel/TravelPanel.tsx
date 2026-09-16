"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { compressImageForSolunaUpload } from "@/lib/soluna-image-compress";
import {
  assertTravelUploadPayloadSize,
  prepareTravelUploadFile,
  readApiErrorMessage,
  TRAVEL_UPLOAD_ACCEPT,
} from "@/lib/travel-material-client";
import {
  stopMapEmoji,
  TRANSPORT_EMOJI,
  TRANSPORT_LABEL,
} from "@/lib/travel-icons";
import { formatTravelWeatherLine } from "@/lib/travel-weather-format";
import type {
  TravelMaterial,
  TravelStop,
  TravelStopKind,
  TravelTransportMode,
  TravelTrip,
  TravelTripListItem,
} from "@/lib/types/travel";

const TravelMap = dynamic(() => import("@/components/travel/TravelMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[320px] items-center justify-center rounded-2xl border border-white/10 bg-black/30 text-sm text-slate-400 sm:h-[420px]">
      地図を準備中…
    </div>
  ),
});

const KIND_LABEL: Record<TravelStopKind, string> = {
  sight: "観光",
  meal: "食事",
  hotel: "宿泊",
  transport: "移動",
  free: "自由",
  other: "その他",
};

const TRANSPORT_OPTIONS = Object.keys(TRANSPORT_LABEL) as TravelTransportMode[];

function WeatherCard({ stop }: { stop: TravelStop }) {
  const w = stop.weather;
  if (!w) {
    return (
      <p className="mt-2 text-[11px] text-slate-500">
        天気未取得（位置と日付が付いたら「天気・環境を取得」）
      </p>
    );
  }
  return (
    <div className="mt-2 rounded-xl border border-sky-300/25 bg-sky-400/10 px-2.5 py-2 text-xs text-sky-50">
      <p className="font-medium text-sky-100">
        {w.date} · {w.label}
        <span className="ml-1 text-[10px] text-sky-200/80">
          {w.source === "archive" ? "実測（保管）" : "予報"}
        </span>
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-sky-50/90">
        {formatTravelWeatherLine(w)}
      </p>
    </div>
  );
}

export default function TravelPanel() {
  const [trips, setTrips] = useState<TravelTripListItem[]>([]);
  const [trip, setTrip] = useState<TravelTrip | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [materialText, setMaterialText] = useState("");
  const [journalBody, setJournalBody] = useState("");
  const [uploadBusyLabel, setUploadBusyLabel] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    title: "",
    destination: "",
    startDate: "",
    endDate: "",
  });
  const [stopDraft, setStopDraft] = useState({
    name: "",
    kind: "sight" as TravelStopKind,
    transportMode: "" as "" | TravelTransportMode,
    dayIndex: "0",
    date: "",
    timeLabel: "",
    address: "",
    note: "",
    geocodeQuery: "",
  });

  const selectedStop = useMemo(
    () => trip?.stops.find((s) => s.id === selectedStopId) ?? null,
    [trip, selectedStopId],
  );

  const loadList = useCallback(async () => {
    const res = await fetch("/api/travel/trips");
    const data = (await res.json()) as { trips?: TravelTripListItem[]; error?: string };
    if (!res.ok) throw new Error(data.error || "一覧の取得に失敗");
    setTrips(data.trips ?? []);
  }, []);

  const openTrip = useCallback(async (id: string) => {
    const res = await fetch(`/api/travel/trips/${encodeURIComponent(id)}`);
    const data = (await res.json()) as { trip?: TravelTrip; error?: string };
    if (!res.ok) throw new Error(data.error || "旅行の取得に失敗");
    setTrip(data.trip ?? null);
    setSelectedStopId(data.trip?.stops[0]?.id ?? null);
    if (data.trip?.startDate) {
      setStopDraft((d) => ({ ...d, date: d.date || data.trip!.startDate }));
    }
  }, []);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        await loadList();
      } catch (err) {
        setError(err instanceof Error ? err.message : "読み込み失敗");
      } finally {
        setLoading(false);
      }
    })();
  }, [loadList]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/travel/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = (await res.json()) as { trip?: TravelTrip; error?: string };
      if (!res.ok) throw new Error(data.error || "作成に失敗");
      setDraft({ title: "", destination: "", startDate: "", endDate: "" });
      await loadList();
      if (data.trip) {
        setTrip(data.trip);
        setSelectedStopId(null);
        setStopDraft((d) => ({ ...d, date: data.trip!.startDate }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "作成に失敗");
    } finally {
      setBusy(false);
    }
  }

  async function handleUploadMaterials(selected: File[]) {
    if (!trip) {
      setError("先に旅行を作成または選択してからアップロードしてください。");
      return;
    }
    if (busy) {
      setError("別の処理が終わるまでお待ちください。");
      return;
    }
    if (!selected.length) {
      setError("ファイルが選択されませんでした。もう一度選んでください。");
      return;
    }
    setBusy(true);
    setUploadBusyLabel("資料を準備中…");
    setError(null);
    try {
      const files = [];
      for (const file of selected.slice(0, 3)) {
        files.push(
          await prepareTravelUploadFile(file, (msg) => setUploadBusyLabel(msg)),
        );
      }
      assertTravelUploadPayloadSize(files);
      setUploadBusyLabel("サーバーへ送信・保存中…");
      const res = await fetch(
        `/api/travel/trips/${encodeURIComponent(trip.id)}/materials`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ files }),
        },
      );
      if (!res.ok) {
        throw new Error(await readApiErrorMessage(res, "アップロード"));
      }
      const data = (await res.json()) as {
        trip?: TravelTrip;
        error?: string;
        added?: Array<{ fileName: string; chunkCount: number; extractedChars: number }>;
      };
      if (!data.trip) {
        throw new Error(data.error || "保存結果を受け取れませんでした");
      }
      setTrip(data.trip);
      const summary = (data.added ?? [])
        .map((a) => `${a.fileName}（${a.chunkCount}チャンク）`)
        .join("、");
      setUploadBusyLabel(
        summary
          ? `取り込み完了: ${summary} →「RAG判読して地図へ」を押してください`
          : "取り込み完了 →「RAG判読して地図へ」を押してください",
      );
      await loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "資料のアップロードに失敗");
      setUploadBusyLabel(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteMaterial(materialId: string) {
    if (!trip || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/travel/trips/${encodeURIComponent(trip.id)}/materials`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ materialId }),
        },
      );
      const data = (await res.json()) as { trip?: TravelTrip; error?: string };
      if (!res.ok) throw new Error(data.error || "資料の削除に失敗");
      setTrip(data.trip ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "資料の削除に失敗");
    } finally {
      setBusy(false);
    }
  }

  async function handleParse() {
    if (!trip) {
      setError("先に旅行を選択してください。");
      return;
    }
    if (busy) {
      setError("別の処理が終わるまでお待ちください。");
      return;
    }
    const hasMaterials = (trip.materials?.length ?? 0) > 0;
    if (!materialText.trim() && !hasMaterials) {
      setError("電子ファイルをアップロードするか、テキストを貼り付けてください。");
      return;
    }
    setBusy(true);
    setUploadBusyLabel("RAG 判読中…");
    setError(null);
    try {
      const res = await fetch(
        `/api/travel/trips/${encodeURIComponent(trip.id)}/parse`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: materialText,
            useMaterials: true,
          }),
        },
      );
      if (!res.ok) throw new Error(await readApiErrorMessage(res, "RAG判読"));
      const data = (await res.json()) as {
        trip?: TravelTrip;
        error?: string;
        provider?: string;
        parsedStopCount?: number;
        needsGeocode?: boolean;
      };
      if (!data.trip) throw new Error(data.error || "判読結果を受け取れませんでした");
      setTrip(data.trip);
      setSelectedStopId(data.trip.stops[0]?.id ?? null);
      const via = data.provider ? `（${data.provider}）` : "";
      setUploadBusyLabel(
        `判読完了: ${data.trip.stops.length} 地点${via}。地図座標を取得中…`,
      );

      try {
        const geoRes = await fetch(
          `/api/travel/trips/${encodeURIComponent(trip.id)}/geocode`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ maxGeocode: 8 }),
          },
        );
        if (geoRes.ok) {
          const geoData = (await geoRes.json()) as {
            trip?: TravelTrip;
            geocodeUpdated?: number;
          };
          if (geoData.trip) {
            setTrip(geoData.trip);
            setUploadBusyLabel(
              `判読完了: ${geoData.trip.stops.length} 地点 · 座標 ${geoData.geocodeUpdated ?? 0} 件${via}`,
            );
          }
        } else {
          setUploadBusyLabel(
            `判読完了: ${data.trip.stops.length} 地点${via}（座標は未取得。日程一覧は確認できます）`,
          );
        }
      } catch {
        setUploadBusyLabel(
          `判読完了: ${data.trip.stops.length} 地点${via}（座標取得スキップ）`,
        );
      }

      await loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "資料の判読に失敗");
      setUploadBusyLabel(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleEnrich() {
    if (!trip || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/travel/trips/${encodeURIComponent(trip.id)}/enrich`,
        { method: "POST" },
      );
      const data = (await res.json()) as { trip?: TravelTrip; error?: string };
      if (!res.ok) throw new Error(data.error || "提案の取得に失敗");
      setTrip(data.trip ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "提案の取得に失敗");
    } finally {
      setBusy(false);
    }
  }

  async function handleWeather() {
    if (!trip || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/travel/trips/${encodeURIComponent(trip.id)}/weather`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force: false }),
        },
      );
      const data = (await res.json()) as {
        trip?: TravelTrip;
        error?: string;
        note?: string;
      };
      if (!res.ok) throw new Error(data.error || "天気の取得に失敗");
      if (data.trip) setTrip(data.trip);
    } catch (err) {
      setError(err instanceof Error ? err.message : "天気の取得に失敗");
    } finally {
      setBusy(false);
    }
  }

  async function handleAddStop(e: React.FormEvent) {
    e.preventDefault();
    if (!trip || busy || !stopDraft.name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/travel/trips/${encodeURIComponent(trip.id)}/stops`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: stopDraft.name,
            kind: stopDraft.kind,
            transportMode: stopDraft.transportMode || undefined,
            dayIndex: Number(stopDraft.dayIndex) || 0,
            date: stopDraft.date || trip.startDate,
            timeLabel: stopDraft.timeLabel || undefined,
            address: stopDraft.address || undefined,
            note: stopDraft.note || undefined,
            geocodeQuery: stopDraft.geocodeQuery || undefined,
          }),
        },
      );
      const data = (await res.json()) as {
        trip?: TravelTrip;
        stop?: TravelStop;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "地点の追加に失敗");
      setTrip(data.trip ?? null);
      if (data.stop) setSelectedStopId(data.stop.id);
      setStopDraft((d) => ({
        ...d,
        name: "",
        address: "",
        note: "",
        geocodeQuery: "",
        timeLabel: "",
      }));
      await loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "地点の追加に失敗");
    } finally {
      setBusy(false);
    }
  }

  async function handleJournal(file?: File | null) {
    if (!trip || busy) return;
    if (!journalBody.trim() && !file) return;
    setBusy(true);
    setError(null);
    try {
      let photoDataUrl: string | undefined;
      if (file) {
        const compressed = await compressImageForSolunaUpload(file);
        photoDataUrl = compressed.dataUrl;
      }
      const res = await fetch(
        `/api/travel/trips/${encodeURIComponent(trip.id)}/journal`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            body: journalBody,
            stopId: selectedStopId ?? undefined,
            photoDataUrl,
          }),
        },
      );
      const data = (await res.json()) as { trip?: TravelTrip; error?: string };
      if (!res.ok) throw new Error(data.error || "ジャーナル保存に失敗");
      setTrip(data.trip ?? null);
      setJournalBody("");
      await loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "ジャーナル保存に失敗");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteTrip(id: string) {
    if (busy || !window.confirm("この旅行を削除しますか？")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/travel/trips/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "削除に失敗");
      if (trip?.id === id) setTrip(null);
      await loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "削除に失敗");
    } finally {
      setBusy(false);
    }
  }

  const stopsByDay = useMemo(() => {
    const map = new Map<number, TravelStop[]>();
    for (const s of trip?.stops ?? []) {
      const list = map.get(s.dayIndex) ?? [];
      list.push(s);
      map.set(s.dayIndex, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.order - b.order);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [trip]);

  const inputClass =
    "w-full rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-sm text-white";

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-5 px-4 py-8 sm:px-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="space-y-4">
        <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
          <p className="text-[10px] tracking-[0.22em] text-teal-200/80 uppercase">
            Trips
          </p>
          <h2 className="mt-1 text-base font-semibold text-white">旅の一覧</h2>
          {loading ? (
            <p className="mt-3 text-sm text-slate-500">読み込み中…</p>
          ) : trips.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">まだ旅行がありません</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {trips.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void openTrip(t.id)}
                    className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                      trip?.id === t.id
                        ? "border-teal-300/40 bg-teal-400/15"
                        : "border-white/10 bg-white/[0.03] hover:bg-white/5"
                    }`}
                  >
                    <p className="truncate text-sm font-medium text-white">
                      {t.title}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      {t.startDate} → {t.endDate} · {t.stopCount}地点
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <form
          onSubmit={(e) => void handleCreate(e)}
          className="space-y-2 rounded-2xl border border-white/10 bg-black/25 p-4"
        >
          <p className="text-[11px] font-medium text-teal-100">新しい旅</p>
          <input
            required
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            placeholder="タイトル（例: 春の京都）"
            className={inputClass}
          />
          <input
            value={draft.destination}
            onChange={(e) =>
              setDraft((d) => ({ ...d, destination: e.target.value }))
            }
            placeholder="行き先（例: 京都・奈良）"
            className={inputClass}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              required
              type="date"
              value={draft.startDate}
              onChange={(e) =>
                setDraft((d) => ({ ...d, startDate: e.target.value }))
              }
              className="rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white"
            />
            <input
              required
              type="date"
              value={draft.endDate}
              onChange={(e) =>
                setDraft((d) => ({ ...d, endDate: e.target.value }))
              }
              className="rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-gradient-to-r from-teal-400/90 to-cyan-400/80 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40"
          >
            作成
          </button>
        </form>
      </aside>

      <section className="space-y-4">
        {error && (
          <p className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
            {error}
          </p>
        )}

        {!trip ? (
          <div className="rounded-2xl border border-dashed border-white/15 bg-black/20 px-5 py-16 text-center">
            <p className="text-lg text-white">旅を選ぶか、新しく作成</p>
            <p className="mt-2 text-sm text-slate-400">
              手入力でも資料貼付でもコースを作れます。各地点の天気は旅行日に合わせて表示します。
            </p>
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] tracking-[0.22em] text-teal-200/80 uppercase">
                    Itinerary
                  </p>
                  <h1 className="mt-1 text-xl font-semibold text-white sm:text-2xl">
                    {trip.title}
                  </h1>
                  <p className="mt-1 text-sm text-slate-300">
                    {trip.destination || "行き先未設定"} · {trip.startDate} →{" "}
                    {trip.endDate}
                  </p>
                  {trip.summary && (
                    <p className="mt-2 max-w-2xl text-sm text-slate-400">
                      {trip.summary}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <button
                    type="button"
                    disabled={busy || !trip.stops.length}
                    onClick={() => void handleWeather()}
                    className="rounded-xl border border-sky-300/30 bg-sky-400/10 px-3 py-1.5 text-xs font-medium text-sky-100 disabled:opacity-40"
                  >
                    天気・環境を取得
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleDeleteTrip(trip.id)}
                    className="text-[11px] text-rose-200/90 underline disabled:opacity-40"
                  >
                    削除
                  </button>
                </div>
              </div>

              <div className="mt-4">
                <TravelMap
                  stops={trip.stops}
                  selectedStopId={selectedStopId}
                  onSelectStop={(s) => setSelectedStopId(s.id)}
                />
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <form
                onSubmit={(e) => void handleAddStop(e)}
                className="space-y-2 rounded-2xl border border-white/10 bg-black/25 p-4"
              >
                <p className="text-[11px] font-medium text-teal-100">
                  地点を手入力
                </p>
                <p className="text-[11px] text-slate-500">
                  資料がなくても、名前と日付を入れて地図に追加できます
                </p>
                <input
                  required
                  value={stopDraft.name}
                  onChange={(e) =>
                    setStopDraft((d) => ({ ...d, name: e.target.value }))
                  }
                  placeholder="地点名（例: 清水寺 / 新幹線で京都へ）"
                  className={inputClass}
                />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={stopDraft.kind}
                    onChange={(e) =>
                      setStopDraft((d) => ({
                        ...d,
                        kind: e.target.value as TravelStopKind,
                      }))
                    }
                    className={inputClass}
                  >
                    {(Object.keys(KIND_LABEL) as TravelStopKind[]).map((k) => (
                      <option key={k} value={k}>
                        {KIND_LABEL[k]}
                      </option>
                    ))}
                  </select>
                  <select
                    value={stopDraft.transportMode}
                    onChange={(e) =>
                      setStopDraft((d) => ({
                        ...d,
                        transportMode: e.target.value as "" | TravelTransportMode,
                      }))
                    }
                    className={inputClass}
                  >
                    <option value="">乗り物なし</option>
                    {TRANSPORT_OPTIONS.map((m) => (
                      <option key={m} value={m}>
                        {TRANSPORT_EMOJI[m]} {TRANSPORT_LABEL[m]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="number"
                    min={0}
                    value={stopDraft.dayIndex}
                    onChange={(e) =>
                      setStopDraft((d) => ({ ...d, dayIndex: e.target.value }))
                    }
                    title="日目（0=1日目）"
                    placeholder="日目"
                    className="rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white"
                  />
                  <input
                    type="date"
                    value={stopDraft.date}
                    onChange={(e) =>
                      setStopDraft((d) => ({ ...d, date: e.target.value }))
                    }
                    className="rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white"
                  />
                  <input
                    value={stopDraft.timeLabel}
                    onChange={(e) =>
                      setStopDraft((d) => ({ ...d, timeLabel: e.target.value }))
                    }
                    placeholder="10:00"
                    className="rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white"
                  />
                </div>
                <input
                  value={stopDraft.address}
                  onChange={(e) =>
                    setStopDraft((d) => ({ ...d, address: e.target.value }))
                  }
                  placeholder="住所・エリア（任意）"
                  className={inputClass}
                />
                <input
                  value={stopDraft.geocodeQuery}
                  onChange={(e) =>
                    setStopDraft((d) => ({ ...d, geocodeQuery: e.target.value }))
                  }
                  placeholder="地図検索語（任意・空なら名前で検索）"
                  className={inputClass}
                />
                <textarea
                  value={stopDraft.note}
                  onChange={(e) =>
                    setStopDraft((d) => ({ ...d, note: e.target.value }))
                  }
                  rows={2}
                  placeholder="メモ（任意）"
                  className={inputClass}
                />
                <button
                  type="submit"
                  disabled={busy || !stopDraft.name.trim()}
                  className="w-full rounded-xl bg-teal-400/90 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40"
                >
                  地点を追加
                </button>
              </form>

              <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                <p className="text-[11px] font-medium text-teal-100">
                  旅行会社資料（電子ファイル / テキスト）
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  PDF・DOCX・画像・テキストをアップロード → チャンク化して RAG
                  判読。手貼りテキストも併用可。
                </p>
                <label className="mt-3 flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-teal-300/35 bg-teal-400/5 px-3 py-5 text-center transition hover:bg-teal-400/10">
                  <span className="text-sm font-medium text-teal-50">
                    {busy && uploadBusyLabel
                      ? uploadBusyLabel
                      : "ファイルを選択してアップロード"}
                  </span>
                  <span className="mt-1 text-[10px] text-slate-500">
                    PDF / DOCX / JPG・PNG / TXT・MD · 最大3件 · ブラウザはブラウザで先に読み取り
                  </span>
                  <input
                    type="file"
                    accept={TRAVEL_UPLOAD_ACCEPT}
                    multiple
                    className="hidden"
                    disabled={busy}
                    onChange={(e) => {
                      // FileList は live。value を先に消すと length=0 になり「未選択」になる
                      const selected = e.target.files
                        ? Array.from(e.target.files)
                        : [];
                      e.target.value = "";
                      void handleUploadMaterials(selected);
                    }}
                  />
                </label>
                {uploadBusyLabel && !busy && (
                  <p className="mt-2 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1.5 text-[11px] text-emerald-50">
                    {uploadBusyLabel}
                  </p>
                )}
                {busy && uploadBusyLabel && (
                  <p className="mt-2 text-[11px] text-amber-100/90">{uploadBusyLabel}</p>
                )}

                {(trip.materials?.length ?? 0) > 0 && (
                  <ul className="mt-3 space-y-1.5">
                    {(trip.materials as TravelMaterial[]).map((m) => (
                      <li
                        key={m.id}
                        className="flex items-start justify-between gap-2 rounded-lg border border-white/8 bg-white/[0.03] px-2.5 py-1.5 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-100">
                            {m.fileName}
                          </p>
                          <p className="text-[10px] text-slate-500">
                            {m.kind} · {m.chunkCount}チャンク ·{" "}
                            {m.extractedChars.toLocaleString("ja-JP")}字 ·{" "}
                            {m.extractMethod}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void handleDeleteMaterial(m.id)}
                          className="shrink-0 text-[10px] text-rose-200/90 underline disabled:opacity-40"
                        >
                          削除
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <textarea
                  value={materialText}
                  onChange={(e) => setMaterialText(e.target.value)}
                  rows={5}
                  placeholder="補足メモや、ファイルがない場合の行程テキスト…"
                  className="mt-3 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-slate-600"
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={
                      busy ||
                      (!materialText.trim() && !(trip.materials?.length ?? 0))
                    }
                    onClick={() => void handleParse()}
                    className="rounded-xl bg-teal-400/90 px-3 py-1.5 text-xs font-semibold text-slate-950 disabled:opacity-40"
                  >
                    {uploadBusyLabel || "RAG判読して地図へ"}
                  </button>
                  <button
                    type="button"
                    disabled={busy || !trip.stops.length}
                    onClick={() => void handleEnrich()}
                    className="rounded-xl border border-cyan-300/30 bg-cyan-400/10 px-3 py-1.5 text-xs font-medium text-cyan-100 disabled:opacity-40"
                  >
                    おすすめ提案を付与
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <p className="text-[11px] font-medium text-teal-100">
                選択中のポイント
              </p>
              {selectedStop ? (
                <div className="mt-2 space-y-1.5 text-sm">
                  <p className="text-base font-semibold text-white">
                    <span className="mr-1.5">{stopMapEmoji(selectedStop)}</span>
                    {selectedStop.name}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {KIND_LABEL[selectedStop.kind]}
                    {selectedStop.transportMode
                      ? ` · ${TRANSPORT_EMOJI[selectedStop.transportMode]} ${TRANSPORT_LABEL[selectedStop.transportMode]}`
                      : ""}
                    {selectedStop.date ? ` · ${selectedStop.date}` : ""}
                    {selectedStop.timeLabel
                      ? ` · ${selectedStop.timeLabel}`
                      : ""}
                  </p>
                  {selectedStop.address && (
                    <p className="text-xs text-slate-300">{selectedStop.address}</p>
                  )}
                  {selectedStop.note && (
                    <p className="text-xs text-slate-400">{selectedStop.note}</p>
                  )}
                  <WeatherCard stop={selectedStop} />
                  {selectedStop.tip && (
                    <p className="rounded-lg border border-amber-300/20 bg-amber-400/10 px-2.5 py-2 text-xs text-amber-50">
                      おすすめ: {selectedStop.tip}
                      {selectedStop.recommendReason
                        ? `（${selectedStop.recommendReason}）`
                        : ""}
                    </p>
                  )}
                  {selectedStop.externalUrl && (
                    <a
                      href={selectedStop.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block text-[11px] text-cyan-200 underline"
                    >
                      参考リンク
                    </a>
                  )}
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-500">
                  地図のピンか下の日程から選んでください
                </p>
              )}
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <p className="text-[11px] font-medium text-teal-100">日程一覧</p>
              <div className="mt-3 space-y-4">
                {stopsByDay.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    まだポイントがありません。手入力か資料を読み込んでください。
                  </p>
                ) : (
                  stopsByDay.map(([day, list]) => (
                    <div key={day}>
                      <p className="text-xs font-semibold text-cyan-100/90">
                        {day + 1}日目
                      </p>
                      <ul className="mt-1.5 space-y-1">
                        {list.map((s) => (
                          <li key={s.id}>
                            <button
                              type="button"
                              onClick={() => setSelectedStopId(s.id)}
                              className={`w-full rounded-lg px-2.5 py-1.5 text-left text-sm ${
                                s.id === selectedStopId
                                  ? "bg-teal-400/15 text-white"
                                  : "text-slate-300 hover:bg-white/5"
                              }`}
                            >
                              <span className="mr-1">{stopMapEmoji(s)}</span>
                              <span className="text-slate-500">
                                {s.timeLabel || "--:--"}
                              </span>{" "}
                              {s.name}
                              <span className="ml-1 text-[10px] text-slate-500">
                                {KIND_LABEL[s.kind]}
                                {s.lat == null ? " · 位置未確定" : ""}
                                {s.weather
                                  ? ` · ${s.weather.label} ${s.weather.tempMinC != null && s.weather.tempMaxC != null ? `${Math.round(s.weather.tempMinC)}〜${Math.round(s.weather.tempMaxC)}℃` : ""}`
                                  : ""}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <p className="text-[11px] font-medium text-teal-100">
                旅のジャーナル（コメント・写真）
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                写真は見た目を保ったまま自動軽量化してから保存します
              </p>
              <textarea
                value={journalBody}
                onChange={(e) => setJournalBody(e.target.value)}
                rows={3}
                placeholder="今日の一言…"
                className="mt-3 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label className="cursor-pointer rounded-xl border border-white/12 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/5">
                  写真を添付
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={busy}
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      e.target.value = "";
                      void handleJournal(f);
                    }}
                  />
                </label>
                <button
                  type="button"
                  disabled={busy || !journalBody.trim()}
                  onClick={() => void handleJournal(null)}
                  className="rounded-xl bg-gradient-to-r from-teal-400/90 to-cyan-400/80 px-3 py-1.5 text-xs font-semibold text-slate-950 disabled:opacity-40"
                >
                  コメントを残す
                </button>
              </div>
              <ul className="mt-4 max-h-72 space-y-3 overflow-y-auto">
                {(trip.journal ?? []).map((j) => (
                  <li
                    key={j.id}
                    className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2"
                  >
                    <p className="text-[10px] text-slate-500">
                      {new Date(j.createdAt).toLocaleString("ja-JP")}
                      {j.photoByteSize
                        ? ` · ${Math.round(j.photoByteSize / 1024)}KB`
                        : ""}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-200">
                      {j.body}
                    </p>
                    {j.photoDataUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={j.photoDataUrl}
                        alt="journal"
                        className="mt-2 max-h-40 rounded-lg border border-white/10"
                      />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
