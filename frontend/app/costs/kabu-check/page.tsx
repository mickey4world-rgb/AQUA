"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import CostsPageShell from "@/components/costs/CostsPageShell";
import type { StockStationCheckView } from "@/lib/stock-station-check";

type GateState = {
  configured: boolean;
  unlocked: boolean;
  hint?: string;
};

type StatusPayload = {
  stationCheck?: StockStationCheckView;
  opsUnlocked?: boolean;
};

function formatSyncedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
  } catch {
    return iso;
  }
}

export default function KabuCheckPage() {
  const [gate, setGate] = useState<GateState | null>(null);
  const [check, setCheck] = useState<StockStationCheckView | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadGate = useCallback(async () => {
    const res = await fetch("/api/stocks/broker/ops-gate");
    if (!res.ok) throw new Error("gate");
    return (await res.json()) as GateState;
  }, []);

  const loadStatus = useCallback(async () => {
    const res = await fetch("/api/stocks/broker/status");
    if (!res.ok) throw new Error("status");
    return (await res.json()) as StatusPayload;
  }, []);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [g, s] = await Promise.all([loadGate(), loadStatus()]);
      setGate(g);
      if (g.unlocked || s.opsUnlocked) {
        setCheck(s.stationCheck ?? null);
      } else {
        setCheck(null);
      }
    } catch {
      setError(
        "状態を取得できませんでした。AQUA にログインしているか確認してください。",
      );
    }
  }, [loadGate, loadStatus]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // 緑待ちのときは短周期で再確認（OTP 入力直後の変化を拾う）
  useEffect(() => {
    if (!gate?.unlocked) return;
    const waiting = check?.greenMark !== true;
    const ms = waiting ? 15_000 : 60_000;
    const id = window.setInterval(() => void refresh(), ms);
    return () => window.clearInterval(id);
  }, [gate?.unlocked, check?.greenMark, refresh]);

  async function submitPin(action: "set" | "unlock") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/stocks/broker/ops-gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, pin }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) {
        setError(body.error || "PIN 認証に失敗しました");
        return;
      }
      setPin("");
      await refresh();
    } catch {
      setError("通信に失敗しました");
    } finally {
      setBusy(false);
    }
  }

  async function lock() {
    setBusy(true);
    try {
      await fetch("/api/stocks/broker/ops-gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "lock" }),
      });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const unlocked = gate?.unlocked === true;

  return (
    <CostsPageShell>
      <main className="mx-auto max-w-lg px-4 py-6 pb-16">
        <p className="text-[11px] uppercase tracking-[0.18em] text-cyan-300/80">
          Mobile · Kabu login
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-white">
          株ステーション外出ログイン
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">
          パスコード／ワンタイムパスワードは VM 上の株ステーション画面に入力します。
          インターネットへ RDP は開けません。Tailscale（私設VPN）で画面操作し、緑マークはここで確認します。
        </p>

        <div className="mt-4 flex flex-wrap gap-2 text-[12px]">
          <Link
            href="/costs?tab=assets-stocks"
            className="rounded-full border border-white/15 px-3 py-1 text-slate-300"
          >
            ← コスト株式
          </Link>
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3 py-1 text-cyan-100"
          >
            緑マーク再確認
          </button>
          {unlocked && (
            <button
              type="button"
              onClick={() => void lock()}
              disabled={busy}
              className="rounded-full border border-white/15 px-3 py-1 text-slate-300"
            >
              ロック
            </button>
          )}
        </div>

        {error && (
          <p className="mt-4 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
            {error}
          </p>
        )}

        {!unlocked && (
          <section className="mt-6 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-4">
            <h2 className="text-base font-semibold text-amber-50">
              {gate?.configured ? "確認PINを入力" : "確認PINを初回設定"}
            </h2>
            <p className="mt-1 text-[12px] text-amber-100/80">
              {gate?.hint ||
                "6〜12桁の数字。携帯ロック解除のあと、この PIN で状態画面を開きます。"}
            </p>
            <input
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              value={pin}
              onChange={(e) =>
                setPin(e.target.value.replace(/\D/g, "").slice(0, 12))
              }
              className="mt-3 w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-center text-2xl tracking-[0.35em] text-white outline-none focus:border-cyan-400/50"
              placeholder="••••••"
            />
            <button
              type="button"
              disabled={busy || pin.length < 6}
              onClick={() =>
                void submitPin(gate?.configured ? "unlock" : "set")
              }
              className="mt-3 w-full rounded-xl bg-cyan-500/90 py-3 text-sm font-semibold text-slate-950 disabled:opacity-40"
            >
              {gate?.configured ? "解除して状態を見る" : "PINを保存して見る"}
            </button>
          </section>
        )}

        {unlocked && check && (
          <section className="mt-6 space-y-4">
            <div
              className={`rounded-2xl border px-4 py-5 text-center ${
                check.greenMark === true
                  ? "border-emerald-400/40 bg-emerald-500/15"
                  : check.greenMark === false
                    ? "border-rose-400/40 bg-rose-500/10"
                    : "border-amber-400/35 bg-amber-500/10"
              }`}
            >
              <div
                className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full border-4 text-3xl font-bold ${
                  check.greenMark === true
                    ? "border-emerald-300/80 bg-emerald-500/30 text-emerald-50"
                    : check.greenMark === false
                      ? "border-rose-300/70 bg-rose-500/25 text-rose-50"
                      : "border-amber-300/70 bg-amber-500/20 text-amber-50"
                }`}
                aria-label={check.greenMarkLabel}
              >
                {check.greenMark === true
                  ? "緑"
                  : check.greenMark === false
                    ? "!"
                    : "?"}
              </div>
              <p className="mt-3 text-lg font-semibold text-white">
                API 緑マーク: {check.greenMarkLabel}
              </p>
              <p className="mt-1 text-sm text-slate-200">{check.summary}</p>
              <p className="mt-2 text-[11px] text-slate-500">
                VM: {check.vm.label}
                {check.vm.lastHeartbeatAt
                  ? ` · 最終応答 ${formatSyncedAt(check.vm.lastHeartbeatAt)}`
                  : ""}
                {check.greenMark !== true
                  ? " · 15秒ごとに自動再確認中"
                  : ""}
              </p>
            </div>

            {check.needsInteractiveLogin && (
              <div className="rounded-2xl border border-sky-400/30 bg-sky-500/10 px-4 py-4">
                <h2 className="text-base font-semibold text-sky-50">
                  いま必要な操作（携帯）
                </h2>
                <p className="mt-1 text-[12px] text-sky-100/85">
                  {check.loginHint}
                </p>
                <ol className="mt-3 list-decimal space-y-2 pl-5 text-[13px] text-slate-100">
                  <li>携帯で Tailscale を接続（私設VPN・初回セットアップ済み前提）</li>
                  <li>
                    「Windows App」または Remote Desktop で{" "}
                    <code className="text-cyan-200">vm-kabu-aqua</code>{" "}
                    に接続
                  </li>
                  <li>
                    株ステーションでパスコード／ワンタイムパスワードを入力し、API
                    アイコンが緑になるまで待つ
                  </li>
                  <li>
                    切断は×ではなくサインアウトせず接続を切る（または
                    tscon）。セッションを殺さない
                  </li>
                  <li>
                    この画面の「緑マーク再確認」— 緑になれば完了
                  </li>
                </ol>
                <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
                  セットアップ手順: リポジトリ{" "}
                  <code className="text-slate-300">
                    docs/STOCK_KABU_PHONE_LOGIN.md
                  </code>
                  。公開インターネットへの RDP / kabu
                  ポート開放はしません（隔離維持）。
                </p>
              </div>
            )}

            {!check.needsInteractiveLogin && check.greenMark === true && (
              <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-3 text-[13px] text-emerald-50">
                緑マーク確認済みです。追加の OTP 入力は不要です。市場時間中はこのまま
                sync/trade が回ります。
              </div>
            )}

            <ul className="space-y-2">
              {check.items.map((item) => (
                <li
                  key={item.id}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium text-white">{item.label}</p>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        item.ok === true
                          ? "bg-emerald-500/20 text-emerald-100"
                          : item.ok === false
                            ? "bg-rose-500/20 text-rose-100"
                            : "bg-slate-500/20 text-slate-300"
                      }`}
                    >
                      {item.id === "green-mark" && item.ok === true
                        ? "緑"
                        : item.ok === true
                          ? "OK"
                          : item.ok === false
                            ? "NG"
                            : "不明"}
                    </span>
                  </div>
                  <p className="mt-1 text-[12px] leading-relaxed text-slate-400">
                    {item.detail}
                  </p>
                </li>
              ))}
            </ul>

            <p className="text-[11px] leading-relaxed text-slate-500">
              隔離: kabu API（18080/81）とインターネット向け RDP は拒否のまま。
              のっとられても他 AQUA アプリの秘密へは届きません。画面操作は
              Tailscale 私設網のみ。
            </p>
          </section>
        )}
      </main>
    </CostsPageShell>
  );
}
