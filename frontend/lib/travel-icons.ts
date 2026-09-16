/** Travel UI 用の可愛い乗り物・種別アイコン */

import type { TravelStop, TravelTransportMode } from "@/lib/types/travel";

export const TRANSPORT_LABEL: Record<TravelTransportMode, string> = {
  walk: "徒歩",
  train: "電車",
  bus: "バス",
  car: "車",
  taxi: "タクシー",
  plane: "飛行機",
  ship: "船",
  bike: "自転車",
  other: "移動",
};

export const TRANSPORT_EMOJI: Record<TravelTransportMode, string> = {
  walk: "👟",
  train: "🚃",
  bus: "🚌",
  car: "🚗",
  taxi: "🚕",
  plane: "✈️",
  ship: "🚢",
  bike: "🚲",
  other: "🧳",
};

const KIND_EMOJI: Record<TravelStop["kind"], string> = {
  sight: "📍",
  meal: "🍴",
  hotel: "🛏️",
  transport: "🧳",
  free: "🎈",
  other: "✨",
};

export function stopMapEmoji(stop: TravelStop): string {
  if (stop.transportMode) return TRANSPORT_EMOJI[stop.transportMode];
  if (stop.kind === "transport") return TRANSPORT_EMOJI.other;
  return KIND_EMOJI[stop.kind] ?? "📍";
}

export function stopMapLabel(stop: TravelStop): string {
  if (stop.transportMode) return TRANSPORT_LABEL[stop.transportMode];
  return stop.name;
}
