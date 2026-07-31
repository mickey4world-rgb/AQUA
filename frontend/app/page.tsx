import AuthStatus from "@/components/AuthStatus";
import Header from "@/components/Header";

export default function Home() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="text-2xl font-bold text-zinc-900">ダッシュボード</h1>
        <p className="mt-2 text-zinc-600">
          個人向け統合アプリ — 認証・保有株・ディズニー・コストレポート
        </p>

        <section className="mt-8 max-w-lg">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            認証ステータス
          </h2>
          <AuthStatus />
        </section>

        <section className="mt-10 grid gap-4 sm:grid-cols-3">
          {[
            { title: "保有株", desc: "米国株・日本株のウォッチと売買アドバイス", href: "/stocks" },
            { title: "ディズニー", desc: "混雑状況・待ち時間・回り方アドバイス", href: "/disney" },
            { title: "コスト", desc: "AI トークン使用量レポート", href: "/costs" },
          ].map((card) => (
            <a
              key={card.href}
              href={card.href}
              className="rounded-lg border border-zinc-200 p-5 hover:border-zinc-400 hover:shadow-sm"
            >
              <h3 className="font-semibold text-zinc-900">{card.title}</h3>
              <p className="mt-1 text-sm text-zinc-500">{card.desc}</p>
            </a>
          ))}
        </section>
      </main>
    </>
  );
}
