# 日本株自動売買 — 運用保守（不変条件）

## ユーザー可见の不変条件

**平日、朝に OTP を1回入れたあと、場中は人手のステーション再起動なしに:**

1. 余力・保有の **sync** が続く  
2. **market-tick**（sync→trade）が約5分ごとに回り、条件を満たせば **LIVE 発注**が Cosmos / Costs に残る  
3. 止まっているときは `/costs/kabu-check` が **自動売買準備OK ではない** と理由付きで示す  

「タスクが登録されている」「API 200」だけでは成功にしない。

## 信頼性マトリクス

| 層 | あるもの | ないもの（残リスク） |
|----|----------|----------------------|
| 収集 | kabuStation localhost → bridge sync → AQUA Cosmos | ステーション自体のクラッシュは Recover が再起動。OTP 再要求時は人手 |
| 発注 | intents API → buySkips 診断 → LIVE は発注窓のみ sendorder | AI 条件未達の日は intents=0（点検に buySkips が残る＝正常な見送り） |
| セッション | SYSTEM RemoteDisconnect + 毎分 Disc→console | 極端な Azure ホスト障害 |
| 同日内リトライ | market-tick 5分 / lunch 12:32 / Sync-Now | なし（意図的に連続リトライ） |
| 朝・可见検知 | kabu-check: 緑 / 同期 / ティック / LIVE | 携帯通知プッシュは未実装（画面確認） |
| オラクル | `Verify-KabuOpsOnVm.ps1` / `market-tick.log` / idle `_CHECK_` + buySkips | |

## 平日オペ（Mickey）

1. 07:00 VM 自動起動 → AutoLogon → ステーション起動待ち  
2. 勤務先から Tailscale → OTP → GUI 緑  
3. `3 Sync-Now`（sync→trade）または待つ（logon wait-ready + market-tick）  
4. `/costs/kabu-check` で **自動売買準備OK**  
5. 切断: `4 Disconnect` 推奨（×でも約1分で自動回収）  

## 月曜に赤のとき（手順）

| 症状 | 見る場所 | 対処 |
|------|----------|------|
| 緑ではない | kabu-check / `api-recover.log` | OTP 再ログイン |
| 場中なのに同期古い | `market-tick.log` / タスク | `Update-BridgeOnVm.ps1` 再適用 |
| LIVE が dry-run | bridge `.env` | `KABU_ALLOW_LIVE_ORDERS=1` + 取引PW |
| 点検ばかりで売買ゼロ | Costs 診断の buySkips | 条件・現金・ウォッチ見直し（インフラではない） |
| ×後に死ぬ | `console-keepalive.log` | SYSTEM タスク有無を Verify |

```powershell
az vm start -g rg-personal-apps-prod -n vm-kabu-aqua
az vm run-command invoke -g rg-personal-apps-prod -n vm-kabu-aqua `
  --command-id RunPowerShellScript `
  --scripts "@infra/kabu-vm/scripts/Verify-KabuOpsOnVm.ps1"
```

## デプロイ後の必須適用

コードを `main` に push したら **VM 上で Update-BridgeOnVm** しないとスクリプト／タスクは古いまま。

```powershell
az vm run-command invoke -g rg-personal-apps-prod -n vm-kabu-aqua `
  --command-id RunPowerShellScript `
  --scripts "Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/mickey4world-rgb/AQUA/main/infra/kabu-vm/scripts/Update-BridgeOnVm.ps1' -OutFile 'C:\kabu-setup\Update-BridgeOnVm.ps1' -UseBasicParsing; powershell -File C:\kabu-setup\Update-BridgeOnVm.ps1"
```

成功マーカー: `KEEP_SELFTEST_OK` / `TASK_OK_SYSTEM` / `TASK_OK kabu-bridge-market-tick` / `UPDATE_BRIDGE_OK`
