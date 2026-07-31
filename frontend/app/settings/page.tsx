"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header";
import type { User } from "@/lib/types/user";
import { loginUrl } from "@/lib/auth";

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

  if (loading) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-lg px-6 py-10">
          <p className="text-zinc-500">読み込み中...</p>
        </main>
      </>
    );
  }

  if (!user) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-lg px-6 py-10">
          <h1 className="text-2xl font-bold text-zinc-900">ユーザー設定</h1>
          <p className="mt-4 text-zinc-600">ログインが必要です。</p>
          <a
            href={loginUrl("github")}
            className="mt-4 inline-flex rounded-md bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-700"
          >
            GitHub でログイン
          </a>
        </main>
      </>
    );
  }

  return (
    <>
      <Header />
      <main className="mx-auto max-w-lg px-6 py-10">
        <h1 className="text-2xl font-bold text-zinc-900">ユーザー設定</h1>
        <p className="mt-2 text-sm text-zinc-500">
          全アプリ共通のプロファイル設定
        </p>

        <form onSubmit={handleSave} className="mt-8 space-y-5">
          <div>
            <label className="block text-sm font-medium text-zinc-700">
              表示名
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700">
              通知先メール
            </label>
            <input
              type="email"
              value={notifyEmail}
              onChange={(e) => setNotifyEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="rounded-md bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
            <p>認証プロバイダ: {user.authProvider}</p>
            <p>月次トークン上限: {user.monthlyTokenLimit.toLocaleString()}</p>
          </div>
          {message && (
            <p className="text-sm text-emerald-700">{message}</p>
          )}
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            {saving ? "保存中..." : "保存"}
          </button>
        </form>
      </main>
    </>
  );
}
