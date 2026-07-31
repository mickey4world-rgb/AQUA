"use client";

import { useEffect, useState } from "react";
import AppPageShell from "@/components/layout/AppPageShell";
import LoginButtons from "@/components/LoginButtons";
import { isAllowedLogin } from "@/lib/allowed-users";
import { getClientPrincipal, logoutUrl } from "@/lib/auth";
import { PAGE_MAIN_CLASS } from "@/lib/mobile-utils";

export default function LoginPage() {
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    async function checkAccess() {
      const principal = await getClientPrincipal();
      if (!principal) {
        setForbidden(false);
        return;
      }

      const emailClaim = principal.claims?.find(
        (c) => c.typ === "emails" || c.typ.includes("email"),
      );
      const email =
        emailClaim?.val ??
        (principal.userDetails.includes("@") ? principal.userDetails : undefined);

      setForbidden(!isAllowedLogin(principal.userDetails, email));
    }

    checkAccess();
  }, []);

  return (
    <AppPageShell theme="portal">
      <main className={`${PAGE_MAIN_CLASS} max-w-md text-center`}>
        <h1 className="text-2xl font-bold text-white sm:text-3xl">ログイン</h1>

        {forbidden ? (
          <div className="mt-8 rounded-2xl border border-rose-400/25 bg-rose-500/10 px-5 py-5 text-left">
            <p className="text-sm font-medium text-rose-200">アクセスが拒否されました</p>
            <p className="mt-2 text-sm text-rose-100/90">
              この Microsoft / GitHub アカウントは AQUA Personal Apps
              の利用が許可されていません。許可されたアカウントで再度ログインしてください。
            </p>
            <a
              href={logoutUrl("/login")}
              className="mt-4 inline-flex rounded-xl border border-rose-400/30 bg-white/5 px-4 py-2.5 text-sm text-rose-100 hover:bg-white/10"
            >
              ログアウトして戻る
            </a>
          </div>
        ) : (
          <>
            <p className="mt-3 text-sm text-slate-400">
              AQUA Personal Apps にアクセスするにはログインが必要です。
              <br />
              Aya / Gest さんは Microsoft アカウントがおすすめです。
            </p>
            <LoginButtons redirectTo="/" className="mt-8 justify-center" />
          </>
        )}
      </main>
    </AppPageShell>
  );
}
