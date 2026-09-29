# 株自動売買ホスト — Azure Windows VM（kabuステーション）

> **依頼の不変条件**: 自宅にPCを常設しない。判断・画面は既存 AQUA（SWA）、発注口だけ Azure 上の Windows に置く。  
> **証券制約**: kabu API は **同一マシンの localhost** のみ（[公式FAQ](https://kabucom.github.io/kabusapi/ptal/faq.html)）。  
> **方針C Phase C2**: 日本株・現物の**買い／売り**シミュレーション。既定 dry-run。条件 #1〜#19。

関連: [`STOCK_KABU_SETUP.md`](./STOCK_KABU_SETUP.md) · bridge: `tools/kabu-bridge`

---

## 1. 以前の整理の再確認（この文書の前提）

| 項目 | 合意内容 |
|------|----------|
| 証券 | 三菱UFJ eスマート（kabuステーションAPI） |
| ゴール | 方針 **C**（自動発注）だが安全ゲート付き |
| 実行場所 | **Azure Windows VM**（自宅常時起動PCは使わない） |
| アプリ本体 | 既存 SWA `swa-personal-apps-prod` / RG `rg-personal-apps-prod` |
| リージョン | **Japan East**（Cosmos・国内データ方針に合わせる） |
| コスト | Serverless 優先の既存方針に合わせ、**市場時間だけ起動** |
| セキュリティ | APIポートをインターネットに晒さない。秘密は Key Vault / 環境変数。RDP 最小化 |

SWA 単体では kabu に届かない。VM は「クラウド上の取引専用Windows」であり、自宅PCの代替。

---

## 2. 目標アーキテクチャ

```
[ブラウザ] → AQUA SWA (East Asia / aquacore.net)
                │ インテント生成・画面・Cosmos
                │ HTTPS のみ（既存）
                ▼
[Japan East VNet]
  subnet-kabu
    └ Windows VM (B2s 系)
         ├ kabuステーション (localhost:18080/18081)
         ├ kabu-bridge (Task Scheduler)
         │     sync / trade → POST aquacore.net/api/stocks/broker/*
         └ 送信のみ（アウトバウンド HTTPS）
  NSG
    ✗ 18080/18081 を Internet から拒否（必須）
    △ RDP 3389 は JIT または固定IPのみ（Bastionは高コストのため初期は非採用）
  Key Vault（任意・推奨）
    └ API/取引パスワード・BRIDGE_SECRET
```

**禁止**: ルータ／NSG で `18080`/`18081` をインターネット公開。

---

## 3. コスト意識（目安）

前提: Japan East・従量・税別の概算。料金は変動するため Portal 見積を正とする。

| 項目 | 方針 | 概算イメージ |
|------|------|----------------|
| VM サイズ | **Standard_B2s**（2 vCPU / 4 GiB）— kabu GUI 用。1 GiB 級は不可 | 常時なら月数千円台〜 |
| 起動時間 | **平日 08:00–16:30 JST のみ**（約 8.5h×21日 ≒ 180h/月） | 常時の **約 1/4** |
| OS ディスク | **Standard SSD 128GB**（Premium は初期不要） | ディスクは停止中も課金 |
| 公開IP | Standard SKU・静的（必要最小） | 小額 |
| Bastion | **初期は使わない**（月額が大きい） | 代わりに JIT + IP制限 |
| Spot | **使わない**（取引中に奪取されうる） | — |
| Automation | Start/Stop 用（従量・軽微） | 小額 |

停止（deallocate）中は **計算課金は止まるがディスクは残る**。  
週末・祝日は起動しないスケジュールにする。

---

## 4. セキュリティ意識

| 対策 | 内容 |
|------|------|
| ネットワーク | VNet + NSG。kabu ポートは **Inbound Deny any** |
| 管理面 | RDP は **Just-in-Time** または Mickey 宅の固定IPのみ Allow |
| 秘密 | `STOCK_KABU_BRIDGE_SECRET` / API・取引パスワードをチャット・Git に書かない。VM 上は ACL 付き `.env` または Key Vault |
| 発注ゲート | `KABU_ALLOW_LIVE_ORDERS=0` 既定。検証ポート `18081` から |
| 更新 | Windows Update 自動。ローカル管理者を最小に |
| 監査 | bridge の dry-run / submitted を Cosmos `StockBrokerOrders` に残す（既存） |
| 送信 | VM → インターネットは HTTPS（AQUA）と Windows Update 程度に限定（NSG Outbound は段階的に絞れる） |
| ゲストOS | Install スクリプトで **Windows Firewall が 18080/81 inbound を Block**（NSG の二重化） |

---

## 5. 構築準備物（リポジトリ）

| パス | 役割 |
|------|------|
| `infra/kabu-vm/README.md` | デプロイ手順（what-if → create） |
| `infra/kabu-vm/main.bicep` | VNet / NSG / NIC / Public IP / VM / 自動シャットダウン / tags |
| `infra/kabu-vm/parameters.json` | サイズ・名前の既定値（パスワードは含めない） |
| `infra/kabu-vm/scripts/Install-KabuHost.ps1` | VM 上: Node・bridge・`.env` ACL・ゲストFW |
| `infra/kabu-vm/scripts/Start-Stop-Notes.md` | 市場時間 Start/Stop の Automation メモ |

---

## 6. Mickey 側でまだ必要なもの（秘密はチャット禁止）

1. kabuステーションAPI **利用設定済み** ✅（済）
2. VM 上で kabuステーション インストール＋API緑
3. APIパスワード（検証／本番）を VM の `.env` のみに
4. `STOCK_KABU_BRIDGE_SECRET`（SWA と VM で同一）— 未設定ならデプロイ時に発行
5. AQUA `userId`
6. RDP 用の許可IP（自宅グローバルIP `/32`）または JIT 運用の合意

---

## 7. 信頼性マトリクス（初回準備の成果物）

| 領域 | あるもの | ないもの（残リスク・次段） |
|------|----------|---------------------------|
| 収集 | bridge `sync` → AQUA broker API | VM 未作成時は同期ゼロ（明示） |
| 発注 | dry-run 既定・LIVE フラグ・売りのみ | 買い／信用／自動LIVE |
| 計算コスト | B2s・16:30 shutdown・市場時間方針 | 朝の自動 Start（初期は手動） |
| 秘密 | `.env` ACL・チャット禁止・secure param | Key Vault 連携（任意・次段） |
| ネットワーク | Deny 18080/81・Deny RDP Internet・/32 or JIT | Bastion（コストのため非採用） |
| オラクル | what-if → NSG ルール確認 → probe/sync/trade dry-run | 本番 LIVE は別ゲート |

---

## 8. 依頼 ↔ 結果（この準備の完了条件）

| チェック | 合格 |
|----------|------|
| Literal | 「自宅PC常設なし」「Azure Windows」「コスト・セキュリティ考慮」が文書と infra に残っている |
| Counterexample | SWA から直接 sendorder する設計になっていない / 18080 を開けていない |
| Stranger | 第三者が README だけで「なぜVMが要るか」「ポートを開けないか」分かる |
| Cost | 市場時間起動・B2s・Bastion非採用が明記 |
| Security | 18080/81 非公開・LIVE フラグ・秘密管理が明記 |

**まだやっていないこと**: Portal 上で実 VM を作成すること（`az deployment` は Mickey 承認後）。本リポは **準備（IaC + 手順）** まで。
