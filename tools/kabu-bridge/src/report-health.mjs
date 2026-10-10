/**
 * AQUA へ株ステーション稼働ヘルスを送る（成功・失敗どちらも）。
 * 携帯確認用。発注はしない。
 */
export async function reportBridgeHealth(config, status) {
  const payload = {
    userId: config.aquaUserId,
    stationReachable: Boolean(status.stationReachable),
    stationTokenOk: Boolean(status.stationTokenOk),
    lastError:
      typeof status.lastError === "string" && status.lastError.trim()
        ? status.lastError.trim().slice(0, 240)
        : null,
    allowLiveOrders: process.env.KABU_ALLOW_LIVE_ORDERS?.trim() === "1",
    kabuBaseUrl: config.kabuBaseUrl,
    kabuPort: Number(new URL(config.kabuBaseUrl).port) || undefined,
    reportedAt: new Date().toISOString(),
    recoveryStatus:
      typeof status.recoveryStatus === "string" && status.recoveryStatus.trim()
        ? status.recoveryStatus.trim().slice(0, 40)
        : undefined,
    recoveryAction:
      typeof status.recoveryAction === "string" && status.recoveryAction.trim()
        ? status.recoveryAction.trim().slice(0, 80)
        : undefined,
    recoveryAt:
      typeof status.recoveryAt === "string" ? status.recoveryAt : undefined,
  };

  const res = await fetch(`${config.aquaBridgeUrl}/api/stocks/broker/health`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.aquaBridgeSecret}`,
    },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("[kabu-bridge] health report failed", res.status, body);
    return false;
  }
  console.log(
    `[kabu-bridge] health ok reachable=${payload.stationReachable} token=${payload.stationTokenOk}`,
  );
  return true;
}

/** ポートが開いているか（ログイン前でも true になりうる） */
export async function probeStationHttp(baseUrl) {
  try {
    const res = await fetch(`${baseUrl}/`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    return res.status > 0;
  } catch {
    return false;
  }
}
