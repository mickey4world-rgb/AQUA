"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppPageShell from "@/components/layout/AppPageShell";
import LoginButtons from "@/components/LoginButtons";
import { isAllowedLogin } from "@/lib/allowed-users";
import { getClientPrincipal } from "@/lib/auth";
import type { ClientPrincipal } from "@/lib/types/auth";
import { PAGE_MAIN_CLASS } from "@/lib/mobile-utils";

function emailFromPrincipal(principal: ClientPrincipal): string | undefined {
  const emailClaim = principal.claims?.find(
    (c) => c.typ === "emails" || c.typ.includes("email"),
  );
  if (emailClaim?.val) return emailClaim.val;
  if (principal.userDetails.includes("@")) return principal.userDetails;
  return undefined;
}

export default function LoginPage() {
  const [forbidden, setForbidden] = useState(false);
  const [blockedAccount, setBlockedAccount] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkAccess() {
      setLoading(true);
      const principal = await getClientPrincipal();
      if (!principal) {
        setForbidden(false);
        setBlockedAccount(null);
        setLoading(false);
        return;
      }

      const email = emailFromPrincipal(principal);
      const allowed = isAllowedLogin(principal.userDetails, email);
      setForbidden(!allowed);
      setBlockedAccount(allowed ? null : principal.userDetails);
      setLoading(false);
    }

    checkAccess();
  }, []);

  return (
    <AppPageShell theme="portal">
      <main className={`${PAGE_MAIN_CLASS} max-w-md text-center`}>
        <h1 className="text-2xl font-bold text-white sm:text-3xl">ログイン</h1>

        {loading ? (
          <p className="mt-8 text-sm text-slate-400">認証状態を確認中...</p>
        ) : forbidden ? (
          <div className="mt-8 space-y-6 text-left">
            <div className="rounded-2xl border border-rose-400/25 bg-rose-500/10 px-5 py-5">
              <p className="text-sm font-medium text-rose-200">ログインに失敗しました</p>
              <p className="mt-2 text-sm text-rose-100/90">
                {blockedAccount ? (
                  <>
                    <span className="font-medium text-rose-50">{blockedAccount}</span>
                    {" "}は AQUA Personal Apps の利用が許可されていません。
                  </>
                ) : (
                  <>このアカウントは AQUA Personal Apps の利用が許可されていません。</>
                )}
              </p>
              <p className="mt-2 text-sm text-rose-100/80">
                許可された Microsoft / GitHub アカウントで、もう一度ログインしてください。
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-5">
              <p className="text-sm font-medium text-white">別のアカウントでログイン</p>
              <p className="mt-1 text-xs text-slate-400">
                下のボタンからアカウント選択画面（メール・パスワード入力）に進めます。
              </p>
              <LoginButtons redirectTo="/" switchAccount className="mt-4 justify-center" />
            </div>

            <Link
              href="/sample"
              className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-500/10 px-5 py-2.5 text-sm font-medium text-cyan-100 transition hover:border-cyan-400/40 hover:bg-cyan-500/15"
            >
              認証なしで Studio 紹介を見る
            </Link>
          </div>
        ) : (
          <>
            <p className="mt-3 text-sm text-slate-400">
              AQUA Personal Apps にアクセスするにはログインが必要です。
              <br />
              Aya / Gest さんは Microsoft アカウントがおすすめです。
            </p>
            <Link
              href="/sample"
              className="mt-6 inline-flex items-center gap-2 rounded-full border border-cyan-400/25 bg-cyan-500/10 px-5 py-2.5 text-sm font-medium text-cyan-100 transition hover:border-cyan-400/40 hover:bg-cyan-500/15"
            >
              認証なしで Studio 紹介を見る
              <span aria-hidden>→</span>
            </Link>
            <LoginButtons redirectTo="/" className="mt-6 justify-center" />
          </>
        )}
      </main>
    </AppPageShell>
  );
}
