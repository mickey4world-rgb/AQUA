# infra/kabu-vm — Azure Windows ホスト（kabu）

Japan East にコスト抑えめの Windows VM を用意する Bicep。  
**kabu API ポートをインターネットに公開しない。**  
詳細方針: [`docs/STOCK_KABU_AZURE_VM.md`](../../docs/STOCK_KABU_AZURE_VM.md)

## 前提

- Azure CLI ログイン済み（`az login`）
- 既存 RG: `rg-personal-apps-prod`（別RGでも可）
- 管理者パスワードは対話入力（リポに書かない）
- `rdpAllowedCidr` は自宅グローバルIPの `/32`（空なら RDP 許可ルールなし＝JIT 前提）

## 作成前チェック（what-if）

```powershell
cd infra/kabu-vm
az deployment group what-if `
  --resource-group rg-personal-apps-prod `
  --template-file main.bicep `
  --parameters `@parameters.json `
  --parameters adminPassword=PLACEHOLDER_WILL_CHANGE
```

## デプロイ（作成は Mickey 承認後に明示実行）

```powershell
cd infra/kabu-vm

$adminPass = Read-Host "VM admin password" -AsSecureString
$BSTR = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($adminPass)
$adminPassText = [Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($BSTR)

# 例: 自宅IPのみ RDP（必ず /32）。JIT なら rdpAllowedCidr は空のまま
$rdp = "YOUR.PUBLIC.IP.HERE/32"

az deployment group create `
  --resource-group rg-personal-apps-prod `
  --template-file main.bicep `
  --parameters `@parameters.json `
  --parameters adminPassword=$adminPassText rdpAllowedCidr=$rdp

Remove-Variable adminPassText, adminPass, BSTR -ErrorAction SilentlyContinue
```

## デプロイ後チェックリスト

1. Portal 出力の `publicIpAddress` を控える（チャットにパスワードは貼らない）
2. **JIT**（Defender for Cloud）を有効化、または NSG が `/32` のみであることを確認
3. NSG に `Deny-KabuApi-Internet`（18080/81）があること
4. RDP（初期構築時・信頼IPまたは JIT）→ kabuステーション インストール → API アイコン緑（検証 18081）
5. 外出先 OTP 用: `scripts/Install-TailscaleForPhoneAccess.ps1` + `docs/STOCK_KABU_PHONE_LOGIN.md`（Internet RDP は開けない）
5. `scripts/Install-KabuHost.ps1`（Node + bridge + `.env` ACL + ゲストFW）
6. `C:\kabu-bridge\.env` を埋める（`KABU_ALLOW_LIVE_ORDERS=0`）
7. `npm run probe` → `sync` → `trade`（dry-run）
8. 平日 16:30 JST 自動停止を確認。朝起動・無人ログオンは `Start-Stop-Notes.md`
9. 無人化する場合（推奨順）:
   - `scripts/Configure-KabuSessionKeepAlive.ps1`（スクセ無効・tscon bat）
   - `scripts/Enable-KabuAutoLogon.ps1`（Sysinternals・パスワードはGUIのみ）
   - `scripts/Configure-KabuAutostart.ps1`（kabu スタートアップ + bridge タスク）
   - RDP 切断は必ず `C:\kabu-setup\Disconnect-Rdp-KeepDesktop.bat`（×禁止）

## コスト（既定）

| 項目 | 設定 |
|------|------|
| サイズ | `Standard_B2s` |
| ディスク | Standard SSD 128GB |
| 停止 | 毎日 16:30 JST Auto-shutdown（deallocate） |
| 起動 | **平日 05:00 JST** Automation（`Deploy-WeekdayVmStart.ps1`） |
| Bastion / Spot | **含めない** |

停止中もディスク課金は残る。不要になったら VM + ディスク削除。
