# 株投資構築 — 三菱UFJ eスマート証券（kabuステーションAPI）

> 方針: **C（自動発注）** — Phase **C2** は **日本株・現物の買い／売り** シミュレーション、既定 **dry-run**。  
> **ホスト**: **Azure Windows VM**（Japan East）。詳細は [`STOCK_KABU_AZURE_VM.md`](./STOCK_KABU_AZURE_VM.md)。

## なぜ SWA だけでは足りないか

kabu API は **同一マシンの localhost** のみ。AQUA（SWA）は判断・画面・Cosmos。発注口は VM 上の kabu + bridge。

## Phase C2 不変条件

| する | しない |
|------|--------|
| JP ウォッチ AI buy/sell → インテント | 信用・米国株発注 |
| bridge 既定 dry-run（検証で実市場観察） | LIVE 既定オン |
| `KABU_ALLOW_LIVE_ORDERS=1` で初めて sendorder | 18080/81 の Internet 公開 |
| 条件 #1〜#24 をブラウザ表示（仮想通貨と同型） | 条件なしの闇雲発注 |
| 月次売り益 = 元本の 2%以上・現金&lt;30万は少額買い継続 | 現金薄いとき売買停止 |
| 監査AI（#23）＋同因2回で条件昇格（#24） | 反省を捨てたまま再発 |
| 元本対比の実現損益グラフ（コスト画面） | 含み益だけを「利益」と表示 |

明日の検証: VM で kabu 緑 → `sync` → `trade`（dry-run）。  
ブラウザ: `/stocks`（米国のみ）と `/costs` →「資産運用 · 株式」でログ・グラフ・監査・条件を確認。

## クイックリンク

- Azure VM: [`STOCK_KABU_AZURE_VM.md`](./STOCK_KABU_AZURE_VM.md)
- 条件カタログ: `frontend/lib/stock-trade-rules.ts`
- bridge: `tools/kabu-bridge/`
