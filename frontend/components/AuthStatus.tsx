"use client";

import { useEffect, useState } from "react";
import type { ClientPrincipal } from "@/lib/types/auth";
import { getClientPrincipal, loginUrl, logoutUrl } from "@/lib/auth";

export default function AuthStatus() {
  const [principal, setPrincipal] = useState<ClientPrincipal | null | undefined>(
    undefined,
  );

  useEffect(() => {
    getClientPrincipal().then(setPrincipal);
  }, []);

  if (principal === undefined) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-500">
        認証状態を確認中...
      </div>
    );
  }

  if (!principal) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4">
        <p className="mb-3 text-sm text-amber-900">未ログインです</p>
        <a
          href={loginUrl("github")}
          className="inline-flex items-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
        >
          GitHub でログイン
        </a>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-4">
      <p className="text-sm font-medium text-emerald-900">ログイン済み</p>
      <dl className="mt-2 space-y-1 text-sm text-emerald-800">
        <div className="flex gap-2">
          <dt className="font-medium">ユーザー:</dt>
          <dd>{principal.userDetails}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-medium">プロバイダ:</dt>
          <dd>{principal.identityProvider}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-medium">ID:</dt>
          <dd className="truncate font-mono text-xs">{principal.userId}</dd>
        </div>
      </dl>
      <a
        href={logoutUrl()}
        className="mt-3 inline-flex items-center rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-sm text-emerald-900 hover:bg-emerald-100"
      >
        ログアウト
      </a>
    </div>
  );
}
