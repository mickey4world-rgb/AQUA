import LoginButtons from "@/components/LoginButtons";
import Header from "@/components/Header";

export default function LoginPage() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-md px-6 py-16 text-center">
        <h1 className="text-2xl font-bold text-zinc-900">ログイン</h1>
        <p className="mt-3 text-sm text-zinc-600">
          AQUA Personal Apps にアクセスするにはログインが必要です。
          <br />
          Aya / Gest さんは Microsoft アカウントがおすすめです。
        </p>
        <LoginButtons redirectTo="/" className="mt-8 justify-center" />
      </main>
    </>
  );
}
