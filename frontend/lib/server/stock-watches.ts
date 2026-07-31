import { randomUUID } from "crypto";
import { COSMOS_CONTAINERS, getContainer } from "@/lib/server/cosmos";
import type {
  CreateStockWatchRequest,
  StockWatch,
  UpdateStockWatchRequest,
} from "@/lib/types/stock";

function stockContainer() {
  return getContainer(COSMOS_CONTAINERS.stockWatches);
}

export async function listStockWatches(userId: string): Promise<StockWatch[]> {
  const { resources } = await stockContainer()
    .items.query<StockWatch>({
      query: "SELECT * FROM c WHERE c.userId = @userId ORDER BY c.createdAt DESC",
      parameters: [{ name: "@userId", value: userId }],
    })
    .fetchAll();
  return resources;
}

export async function getStockWatch(
  userId: string,
  id: string,
): Promise<StockWatch | null> {
  try {
    const { resource } = await stockContainer().item(id, userId).read<StockWatch>();
    return resource ?? null;
  } catch {
    return null;
  }
}

export async function createStockWatch(
  userId: string,
  input: CreateStockWatchRequest,
): Promise<StockWatch> {
  const now = new Date().toISOString();
  const targetMultiplier = input.targetMultiplier ?? 1.3;
  const ticker = input.ticker.trim().toUpperCase();

  const watch: StockWatch = {
    id: randomUUID(),
    userId,
    ticker,
    buyPrice: input.buyPrice,
    shares: input.shares ?? 0,
    targetMultiplier,
    targetPrice: input.buyPrice * targetMultiplier,
    memo: input.memo?.trim() || undefined,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };

  const { resource } = await stockContainer().items.create(watch);
  return resource!;
}

export async function updateStockWatch(
  userId: string,
  id: string,
  updates: UpdateStockWatchRequest,
): Promise<StockWatch | null> {
  const existing = await getStockWatch(userId, id);
  if (!existing) return null;

  const buyPrice = updates.buyPrice ?? existing.buyPrice;
  const targetMultiplier =
    updates.targetMultiplier ?? existing.targetMultiplier;

  const updated: StockWatch = {
    ...existing,
    ...updates,
    buyPrice,
    targetMultiplier,
    targetPrice: buyPrice * targetMultiplier,
    updatedAt: new Date().toISOString(),
  };

  const { resource } = await stockContainer().item(id, userId).replace(updated);
  return resource!;
}

export async function deleteStockWatch(
  userId: string,
  id: string,
): Promise<boolean> {
  const existing = await getStockWatch(userId, id);
  if (!existing) return false;
  await stockContainer().item(id, userId).delete();
  return true;
}
