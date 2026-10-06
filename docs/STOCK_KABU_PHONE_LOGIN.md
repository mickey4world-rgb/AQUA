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

**注意**: `C:\path\to\repo\...` はドキュメント用の仮表記です。VM 上にはそのフォルダはありません。  
作業ディレクトリは **`C:\kabu-setup`** を使います（リポジトリの clone は不要）。

管理者 PowerShell（対話セッション）で、次をそのまま実行:

```powershell
# --- リポジトリ不要: Tailscale インストール ---
New-Item -ItemType Directory -Force -Path C:\kabu-setup | Out-Null
$msi = "$env:TEMP\tailscale-setup.msi"
Invoke-WebRequest -Uri "https://pkgs.tailscale.com/stable/tailscale-setup-latest-amd64.msi" `
  -OutFile $msi -UseBasicParsing
Start-Process msiexec.exe -ArgumentList "/i `"$msi`" /quiet /norestart" -Wait

# Remote Desktop を有効化（Internet 公開は NSG で拒否のまま。Tailscale 経由のみ）
Set-ItemProperty -Path "HKLM:\System\CurrentControlSet\Control\Terminal Server" `
  -Name "fDenyTSConnections" -Value 0
Enable-NetFirewallRule -DisplayGroup "Remote Desktop" -ErrorAction SilentlyContinue

# PATH 更新のため、ここで PowerShell を一度閉じて開き直してから続行
```

新しい管理者 PowerShell で接続（どちらか一方）:

```powershell
# A) Auth key がある場合（Keys で生成した tskey-auth-...。チャットに貼らない）
$env:TAILSCALE_AUTHKEY = "tskey-auth-...."
tailscale up --auth-key=$env:TAILSCALE_AUTHKEY --hostname=vm-kabu-aqua --accept-dns=true --unattended

# B) Auth key なし（ブラウザでログイン）
tailscale up --hostname=vm-kabu-aqua --accept-dns=true --unattended
# → 表示された URL を同じ VM のブラウザで開き、Tailscale アカウントで承認
```

確認:

```powershell
tailscale status
```

ホスト名は `vm-kabu-aqua` 想定。`Machines` にこの VM が出れば OK。

（任意）手元 PC のリポからスクリプトをコピーする場合だけ:

```powershell
# 手元: scp / 共有などで Install-TailscaleForPhoneAccess.ps1 を VM の C:\kabu-setup へ置く
powershell -File C:\kabu-setup\Install-TailscaleForPhoneAccess.ps1
```

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
5. **GUI 緑の直後**、可能なら `C:\kabu-setup\Sync-Now.cmd` を一度実行（ログオン待ちの wait-ready が拾う前でも即同期できる）
6. 接続を切るときは **× を使わない**。`C:\kabu-setup\Disconnect-Rdp-KeepDesktop.bat`（tscon）
7. `/costs/kabu-check` を開き、大きな **緑** と「余力・保有の同期」が新しいことを確認

注意: **GUI の緑 ≠ 自動で sync 済み**。トークンが取れない半死状態だと緑のまま AQUA が赤のまま残ります。  
そのときは **株ステーションを再起動 → 再ログイン → Sync-Now.cmd**。

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
| GUI は緑だが AQUA が緑でない | `wait-ready.log` / `health.log` / `Sync-Now.cmd`。緑でも token 失敗が続くなら **ステーション再起動** |
| 11時まで sync しない | 旧タスクのハング（IgnoreNew）か API 半死。再起動＋`Ensure-KabuSyncAutomation.ps1` 再適用 |
| AQUA が緑でない・HTTP 失敗 | 株ステーション未起動・ポート 18080/18081 の取り違え |
| 切断後に API が死ぬ | RDP の×切断をやめ、セッション維持（SessionKeepAlive / tscon） |

### 「起動時刻を遅らせれば直る？」

**それだけでは直らない。** 平日 **07:00** 起動（勤務先から遠隔 OTP）に寄せると無駄な未ログイン失敗は減るが、  
「緑なのに sync 不可 → ステーション再起動で治る」は **API 半死 / タスク詰まり / RDP切断** が原因クラス。  
対策は wait-ready・fetch タイムアウト・タスク Parallel／Daily 起点（コード側）と、OTP後の Sync-Now／必要なら再起動（運用）。
