# 外出先から株ステーションへログイン（携帯）

> **依頼の不変条件**: パスコード／ワンタイムパスワードでしかログインできない株ステーションを、外出中の携帯から操作し、**API 緑マーク**まで確認する。  
> **隔離**: インターネットへ RDP / 18080/81 は開けない。他アプリへの横展開経路を作らない。

関連: [`STOCK_KABU_AZURE_VM.md`](./STOCK_KABU_AZURE_VM.md) · 確認画面: `/costs/kabu-check`

---

## 1. 役割分担

| 役割 | 手段 |
|------|------|
| OTP / パスコード入力 | 携帯 → **Tailscale（私設VPN）** → Windows App / RD Client → VM 上の株ステーション GUI |
| 緑マーク確認 | 携帯ブラウザ → AQUA `/costs/kabu-check`（トークン取得成功＝緑相当） |
| 使わない | インターネット向け RDP 公開、kabu API 公開、Azure Bastion（高コスト） |

AQUA の確認画面だけでは OTP は入力できません。GUI 操作は Tailscale 経由のみです。

---

## 2. 初回セットアップ（自宅・1回）

### 2.1 Tailscale アカウント

1. [Tailscale](https://tailscale.com/) で個人アカウント作成（無料枠で可）
2. **Auth key**（Reusable + 短寿命でも可）を発行。チャットや Git に書かない

### 2.2 VM 側

管理者 PowerShell（対話セッション）:

```powershell
cd C:\path\to\repo\infra\kabu-vm\scripts
# 例: 環境変数で渡す（履歴に残したくない場合はその場で入力）
$env:TAILSCALE_AUTHKEY = "tskey-auth-...."   # 手元のみ
powershell -File .\Install-TailscaleForPhoneAccess.ps1
```

確認:

```powershell
tailscale status
```

ホスト名は `vm-kabu-aqua` 想定。

### 2.3 携帯側

1. Tailscale アプリを入れ、同じアカウントでログイン
2. **Windows App**（旧 Remote Desktop）を入れ、PC 名に Tailscale の MagicDNS 名または 100.x アドレスを登録
3. 資格情報は VM の Windows ユーザー（例: `aquaadmin`）。AQUA の PIN とは別

### 2.4 AQUA 確認 PIN

1. 携帯ブラウザで https://www.aquacore.net/costs/kabu-check
2. AQUA ログイン後、6〜12 桁の確認 PIN を初回設定

---

## 3. 朝の外出フロー（毎回）

1. VM 自動起動・AutoLogon 待ち（数分）
2. 携帯 Tailscale を On
3. Windows App で `vm-kabu-aqua` に接続
4. 株ステーションで **パスコード／OTP** を入力 → **API アイコン緑**を目視
5. 接続を切る（セッションをログオフしない。×切断でデスクトップが死ぬ場合は `tscon` 手順を使う — `Start-Stop-Notes.md`）
6. `/costs/kabu-check` を開き、大きな **緑** 表示と「API 緑マーク」を確認（15 秒自動更新）

緑になれば bridge の health/sync が通っている状態です。

---

## 4. 隔離チェック（合格条件）

| チェック | 合格 |
|----------|------|
| NSG | Deny Internet → 18080/81、Deny Internet → 3389 のまま |
| Tailscale | オーバーレイのみ。公開 IP の RDP を増やしていない |
| AQUA | 読み取り＋確認 PIN。発注口や他アプリ秘密は載せない |
| VM 侵害時 | bridge 秘密と kabu ローカル以外を持たない運用を維持 |

---

## 5. トラブル

| 症状 | 見る場所 |
|------|----------|
| 携帯から VM に届かない | Tailscale 双方 Online / `tailscale ping vm-kabu-aqua` |
| GUI は緑だが AQUA が緑でない | `C:\kabu-setup\health.log` / API パスワードと `.env` の一致 / `npm run health` |
| AQUA が緑でない・HTTP 失敗 | 株ステーション未起動・ポート 18080/18081 の取り違え |
| 切断後に API が死ぬ | RDP の×切断をやめ、セッション維持（SessionKeepAlive / tscon） |
