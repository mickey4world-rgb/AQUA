# kabu-bridge

三菱UFJ eスマート証券 **kabuステーションAPI**（localhost）と AQUA を繋ぐ同期・発注ツール。

**実行場所（正）**: Azure Windows VM（自宅常設PCではない）。  
手順: [`docs/STOCK_KABU_AZURE_VM.md`](../../docs/STOCK_KABU_AZURE_VM.md) · IaC: `infra/kabu-vm/`

| コマンド | 内容 |
|---------|------|
| `npm run probe` | トークン＋余力確認 |
| `npm run sync` | 余力・保有 → AQUA |
| `npm run trade` | 売りインテント → **既定 dry-run** / LIVE 時 sendorder |

## 安全装置

- `KABU_ALLOW_LIVE_ORDERS=1` が無い限り sendorder しない
- LIVE 時は `KABU_TRADE_PASSWORD` 必須
- Phase C1 は現物売りのみ
- VM の NSG + ゲストFW で **18080/18081 を Internet 拒否**（必須）

詳細: [`docs/STOCK_KABU_SETUP.md`](../../docs/STOCK_KABU_SETUP.md)
