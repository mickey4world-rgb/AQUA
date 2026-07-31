"use client";

import { useEffect, useState } from "react";
import AppPageShell from "@/components/layout/AppPageShell";
import LoginButtons from "@/components/LoginButtons";
import { PAGE_MAIN_CLASS } from "@/lib/mobile-utils";
import type { User } from "@/lib/types/user";

export default function SettingsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [notifyEmail, setNotifyEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const authRes = await fetch("/.auth/me");
      const authData = await authRes.json();
      if (!authData.clientPrincipal) {
        setLoading(false);
        return;
      }

      let res = await fetch("/api/users/me");
      if (res.status === 404) {
        res = await fetch("/api/users/me", { method: "POST" });
      }

      if (res.ok) {
        const profile: User = await res.json();
        setUser(profile);
        setDisplayName(profile.displayName);
        setNotifyEmail(profile.notifyEmail);
      }
      setLoading(false);
    }
    load();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    const res = await fetch("/api/users/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName, notifyEmail }),
    });

    if (res.ok) {
      const updated: User = await res.json();
      setUser(updated);
      setMessage("保存しました");
    } else {
      setMessage("保存に失敗しました");
    }
    setSaving(false);
  }

  return (
    <AppPageShell theme="portal">
      <main className={`${PAGE_MAIN_CLASS} max-w-lg`}>
        <h1 className="text-2xl font-bold text-white sm:text-3xl">ユーザー設定</h1>
        <p className="mt-2 text-sm text-slate-400">全アプリ共通のプロファイル設定</p>

        {loading ? (
          <p className="mt-8 text-slate-400">読み込み中...</p>
        ) : !user ? (
          <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-slate-300">ログインが必要です。</p>
            <LoginButtons redirectTo="/settings" className="mt-4" />
          </div>
        ) : (
          <form onSubmit={handleSave} className="mt-8 space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-300">表示名</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-base text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300">通知先メール</label>
              <input
                type="email"
                value={notifyEmail}
                onChange={(e) => setNotifyEmail(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-base text-white"
              />
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-slate-400">
              <p>認証プロバイダ: {user.authProvider}</p>
              <p className="mt-1">月次トークン上限: {user.monthlyTokenLimit.toLocaleString()}</p>
            </div>
            {message && <p className="text-sm text-emerald-300">{message}</p>}
            <button
              type="submit"
              disabled={saving}
              className="w-full rounded-xl bg-gradient-to-r from-cyan-500 via-teal-500 to-indigo-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50 sm:w-auto"
            >
              {saving ? "保存中..." : "保存"}
            </button>
          </form>
        )}
      </main>
    </AppPageShell>
  );
}
