# 株投資構築 — 三菱UFJ eスマート証券（kabuステーションAPI）

> 方針: **C（自動発注）** — Phase C1 は **日本株・現物・売りのみ**、既定 **dry-run**。  
> **ホスト**: 自宅常設PCではなく **Azure Windows VM**（Japan East）。詳細は [`STOCK_KABU_AZURE_VM.md`](./STOCK_KABU_AZURE_VM.md)。

## なぜ SWA だけでは足りないか

kabu API は **同一マシンの localhost** のみ（公式FAQ）。  
AQUA（SWA）は判断・画面・Cosmos。発注口は VM 上の kabu + bridge。

```
Azure Windows VM (市場時間のみ起動)
  kabuステーション ←localhost→ kabu-bridge
                                    ↓ HTTPS
AQUA /api/stocks/broker/*
```

---

## 必要な情報

| # | 項目 | 状態 |
|---|------|------|
| 1 | 口座・入金 | ✅ |
| 2 | らくらく電子契約で API 利用設定 | ✅（利用設定済み） |
| 3 | Azure VM 上で kabuステーション＋API緑 | 準備中（IaC 済み） |
| 4 | APIパスワード（VM の `.env` のみ） | 要設定 |
| 5 | 取引パスワード（LIVE 時のみ） | 後で |
| 6 | 検証 `18081` → 本番 `18080` | 検証から |
| 7 | AQUA userId | 要確認 |
| 8 | `STOCK_KABU_BRIDGE_SECRET`（SWA＋VM） | 要発行 |
| 9 | RDP 許可 IP（`/32`）または JIT | 要設定 |
| 10 | 方針 C | ✅ |

チャットにパスワードを貼らないこと。

---

## Phase C1 不変条件

| する | しない |
|------|--------|
| JP ウォッチ sell ＋保有 → 売りインテント | 買い自動 |
| bridge 既定 dry-run | 信用 |
| `KABU_ALLOW_LIVE_ORDERS=1` で初めて sendorder | 米国株発注 |
| NSG で 18080/81 を Internet 拒否 | ポート公開 |

---

## クイックリンク

- Azure VM 準備: [`STOCK_KABU_AZURE_VM.md`](./STOCK_KABU_AZURE_VM.md)
- IaC: `infra/kabu-vm/`
- bridge: `tools/kabu-bridge/`（VM 上で実行）
