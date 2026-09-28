# VM Start / Stop（市場時間）メモ

Azure の **Auto-shutdown**（Bicep で 16:30 JST）は「止める」だけ。  
「朝起動」は別途必要。

## 推奨（コスト最小）

### A. 平日朝だけ手動 or スマホから起動（初期）

Portal → VM → **開始**。慣れるまでこれで十分。

### B. Automation Account（次の段階）

1. Japan East に Automation Account（従量）
2. Runbook: `Start-AzVM` / `Stop-AzVM`
3. スケジュール例（JST）
   - Start: 月–金 08:00
   - Stop: 月–金 16:30（Auto-shutdown と二重でも可）
4. Managed Identity に VM の起動/停止権限

### C. 使わないもの

- **Spot VM**（取引中に強制停止されうる）
- **Bastion 常設**（初期コストが大きい）— 必要なら後から
- **kabu ポートのインターネット公開**

## ゲストOS側（VM内）

kabuステーションは **起動中のみ** API が生きる。  
VM 起動後のログオン自動化が必要なら:

- 自動ログオンは秘密の扱いが難しい → 可能な限り **対話ログオン後に Task Scheduler** で bridge のみ定期実行
- または「ログオン時起動」タスクで kabuステーションを起動（セキュリティと利便のトレードオフを Mickey が承認）

初期運用は **RDP でログオン → kabu 起動確認 → bridge タスク有効** でよい。
