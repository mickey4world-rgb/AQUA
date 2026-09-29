# kabu-bridge

三菱UFJ eスマート証券 **kabuステーションAPI**（localhost）と AQUA を繋ぐ同期・発注ツール。

**実行場所（正）**: Azure Windows VM。  
手順: [`docs/STOCK_KABU_AZURE_VM.md`](../../docs/STOCK_KABU_AZURE_VM.md)

| コマンド | 内容 |
|---------|------|
| `npm run probe` | トークン＋余力確認 |
| `npm run sync` | 余力・保有 → AQUA |
| `npm run trade` | 買い/売りインテント → **既定 dry-run** / LIVE 時 sendorder |

## 安全装置

- `KABU_ALLOW_LIVE_ORDERS=1` が無い限り sendorder しない
- LIVE 時は `KABU_TRADE_PASSWORD` 必須
- Phase C2: 現物の買い／売り（信用なし）
- 条件 #1〜#19（`frontend/lib/stock-trade-rules.ts`）
- NSG + ゲストFW で 18080/18081 Internet 拒否

詳細: [`docs/STOCK_KABU_SETUP.md`](../../docs/STOCK_KABU_SETUP.md)
