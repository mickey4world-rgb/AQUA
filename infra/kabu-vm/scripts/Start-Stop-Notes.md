# VM Start / Stop + 無人ログオン（市場時間）メモ

Azure の **Auto-shutdown**（Bicep で 16:30 JST）は「止める」だけ。  
「朝起動」と「デスクトップまでログオン」は別途必要。kabuステーションは **対話セッション上の GUI** が生きていないと API が動かない。

## 判断（必要可否）

| 要素 | 要否 | 理由 |
|------|------|------|
| 平日朝の VM Start（Azure） | **要**（段階導入） | 止まっている VM では AutoLogon も kabu も動かない |
| Sysinternals AutoLogon | **要**（無人化する場合） | 再起動／deallocate 後に人間の RDP なしでデスクトップまで進める |
| スタートアップで kabu | **要** | API は GUI 起動後のみ |
| Task Scheduler で bridge | **要** | sync/trade は GUI 不要。ログオン遅延＋定期が安定 |
| RDP×ではなく tscon | **必須** | Azure では切断でデスクトップ描画が止まり GUI/API が死ぬことが多い |
| スクセ／スリープ無効 | **必須** | ロックで同様に止まる |
| セッション時間制限なし | **必須**（Windows Server） | 切断・アイドルで強制サインアウトされうる |

初期は手動 RDP でも可。無人化するなら下の順番で揃える。

## 推奨手順（VM 内・管理者 PowerShell）

```powershell
cd C:\path\to\repo\infra\kabu-vm\scripts
# またはスクリプトを VM にコピーして

.\Configure-KabuSessionKeepAlive.ps1
# → Disconnect-Rdp-KeepDesktop.bat が C:\kabu-setup にできる

.\Enable-KabuAutoLogon.ps1
# → Sysinternals GUI。パスワードはツールにだけ入力（Git不可）

.\Configure-KabuAutostart.ps1
# パスが違う場合:
# .\Configure-KabuAutostart.ps1 -KabuExe 'C:\...\kabuステーション.exe'
```

### 運用ルール（落とし穴）

1. RDP を終わるときは **ウィンドウの × を使わない**。`C:\kabu-setup\Disconnect-Rdp-KeepDesktop.bat` を実行する（`tscon %sessionname% /dest:console`）。
2. AutoLogon 有効後、**一度再起動**して無人でデスクトップ＋kabu が来ることを確認する。
3. bridge ログは `C:\kabu-setup\*.log`。

## Azure 側: 朝起動

### A. 平日朝だけ手動（初期）

Portal → VM → **開始**。慣れるまでこれで十分。

### B. Automation Account（次の段階）

1. Japan East に Automation Account（従量）
2. Runbook: `Start-AzVM` / `Stop-AzVM`
3. スケジュール例（JST）
   - Start: 月–金 08:00
   - Stop: 月–金 16:30（Auto-shutdown と二重でも可）
4. Managed Identity に VM の起動/停止権限

朝 Start 後、AutoLogon → スタートアップ kabu → 遅延つき bridge タスク、の順で無人化する。

### C. 使わないもの

- **Spot VM**（取引中に強制停止されうる）
- **Bastion 常設**（初期コストが大きい）— 必要なら後から
- **kabu ポートのインターネット公開**
- **パスワードを .bat / リポジトリに平文保存**（必ず Autologon.exe）

## セキュリティ残リスク（受け入れ）

AutoLogon はディスク上に認証情報を置く。許容条件:

- 取引専用 VM
- NSG で RDP は自宅 `/32` または JIT
- 18080/81 は inbound 拒否のまま
- LIVE 発注は別ゲート（`KABU_ALLOW_LIVE_ORDERS`）
