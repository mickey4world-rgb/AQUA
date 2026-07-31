"use client";

import { useEffect, useState } from "react";
import { isAllowedLogin } from "@/lib/allowed-users";
import type { ClientPrincipal } from "@/lib/types/auth";
import type { User } from "@/lib/types/user";
import { getClientPrincipal, logoutUrl } from "@/lib/auth";
import LoginButtons from "@/components/LoginButtons";

type AuthStatusProps = {
  variant?: "light" | "dark";
};

function emailFromPrincipal(principal: ClientPrincipal): string | undefined {
  const emailClaim = principal.claims?.find(
    (c) => c.typ === "emails" || c.typ.includes("email"),
  );
  if (emailClaim?.val) return emailClaim.val;
  if (principal.userDetails.includes("@")) return principal.userDetails;
  return undefined;
}

async function syncUser(): Promise<{ user: User | null; forbidden: boolean }> {
  const res = await fetch("/api/users/me", { method: "POST" });
  if (res.status === 403) return { user: null, forbidden: true };
  if (!res.ok) return { user: null, forbidden: false };
  return { user: await res.json(), forbidden: false };
}

async function fetchUser(): Promise<{ user: User | null; forbidden: boolean }> {
  const res = await fetch("/api/users/me");
  if (res.status === 403) return { user: null, forbidden: true };
  if (!res.ok) return { user: null, forbidden: false };
  return { user: await res.json(), forbidden: false };
}

export default function AuthStatus({ variant = "light" }: AuthStatusProps) {
  const [principal, setPrincipal] = useState<ClientPrincipal | null | undefined>(
    undefined,
  );
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [forbidden, setForbidden] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const p = await getClientPrincipal();
      setPrincipal(p);

      if (!p) {
        setUser(null);
        setForbidden(false);
        return;
      }

      const email = emailFromPrincipal(p);
      if (!isAllowedLogin(p.userDetails, email)) {
        setForbidden(true);
        setUser(null);
        return;
      }

      let result = await fetchUser();
      if (!result.user && !result.forbidden) {
        result = await syncUser();
      }

      if (result.forbidden) {
        setForbidden(true);
        setUser(null);
        return;
      }

      if (!result.user) {
        setSyncError("ユーザープロファイルの同期に失敗しました");
        setUser(null);
      } else {
        setUser(result.user);
      }
    }
    load();
  }, []);

  if (principal === undefined || user === undefined) {
    return (
      <div
        className={
          variant === "dark"
            ? "rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-400 backdrop-blur-sm"
            : "rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-500"
        }
      >
        認証状態を確認中...
      </div>
    );
  }

  if (!principal) {
    return (
      <div
        className={
          variant === "dark"
            ? "rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-4 backdrop-blur-sm"
            : "rounded-lg border border-amber-200 bg-amber-50 px-4 py-4"
        }
      >
        <p className={`mb-3 text-sm ${variant === "dark" ? "text-amber-200" : "text-amber-900"}`}>
          未ログインです
        </p>
        <LoginButtons redirectTo="/" />
      </div>
    );
  }

  if (forbidden) {
    return (
      <div
        className={
          variant === "dark"
            ? "rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-4 backdrop-blur-sm"
            : "rounded-lg border border-rose-200 bg-rose-50 px-4 py-4"
        }
      >
        <p className={`text-sm font-medium ${variant === "dark" ? "text-rose-200" : "text-rose-900"}`}>
          アクセスが拒否されました
        </p>
        <p className={`mt-2 text-sm ${variant === "dark" ? "text-rose-100/90" : "text-rose-800"}`}>
          ログイン中のアカウント（{principal.userDetails}）は利用が許可されていません。
        </p>
        <a
          href={logoutUrl("/login")}
          className={`mt-3 inline-flex rounded-md border px-3 py-1.5 text-sm ${
            variant === "dark"
              ? "border-rose-400/30 bg-white/5 text-rose-100 hover:bg-white/10"
              : "border-rose-300 bg-white text-rose-900 hover:bg-rose-100"
          }`}
        >
          ログアウト
        </a>
      </div>
    );
  }

  const panelClass =
    variant === "dark"
      ? "rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-4 backdrop-blur-sm"
      : "rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-4";
  const titleClass = variant === "dark" ? "text-emerald-200" : "text-emerald-900";
  const textClass = variant === "dark" ? "text-emerald-100/90" : "text-emerald-800";
  const btnClass =
    variant === "dark"
      ? "inline-flex items-center rounded-md border border-emerald-400/30 bg-white/5 px-3 py-1.5 text-sm text-emerald-100 hover:bg-white/10"
      : "inline-flex items-center rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-sm text-emerald-900 hover:bg-emerald-100";

  return (
    <div className={panelClass}>
      <p className={`text-sm font-medium ${titleClass}`}>ログイン済み</p>
      {syncError && (
        <p className={`mt-1 text-sm ${variant === "dark" ? "text-amber-300" : "text-amber-700"}`}>
          {syncError}
        </p>
      )}
      <dl className={`mt-2 space-y-1 text-sm ${textClass}`}>
        <div className="flex gap-2">
          <dt className="font-medium">表示名:</dt>
          <dd>{user?.displayName ?? principal.userDetails}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-medium">メール:</dt>
          <dd>{user?.email ?? "—"}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-medium">プロバイダ:</dt>
          <dd>{user?.authProvider ?? principal.identityProvider}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-medium">登録日:</dt>
          <dd>
            {user?.createdAt
              ? new Date(user.createdAt).toLocaleDateString("ja-JP")
              : "—"}
          </dd>
        </div>
      </dl>
      <div className="mt-3 flex gap-2">
        <a href="/settings" className={btnClass}>
          設定
        </a>
        <a href={logoutUrl()} className={btnClass}>
          ログアウト
        </a>
      </div>
    </div>
  );
}
