# 日本株自動売買 — 運用保守（不変条件）

## ユーザー可见の不変条件

**仕事場からは OTP（と aquacore 閲覧）以外ほぼできない。** その前提で:

**平日、朝に OTP を1回入れたあと、場中は人手のステーション再起動なしに:**

1. 余力・保有の **sync** が続く  
2. **market-tick**（sync→trade）が約5分ごとに回り、条件を満たせば **LIVE 発注**が Cosmos / Costs に残る  
3. 同期が死んだら **VM が自動判断→OTP不要な回復を優先→必要なら aquacore/メールで OTP 要求**  
4. 止まっているときは `/costs/kabu-check` が **自動売買準備OK ではない** と理由付きで示す  

「タスクが登録されている」「API 200」だけでは成功にしない。

## 検討メモ（何が足りなかったか）

不足の本丸はスクリプトの本数ではなく、**閉ループ（検知→判断→回復→結果を aquacore に出す）** だった。

| 失敗クラス | 旧 | 新 |
|------------|----|----|
| ×切断で Disc | 「4 を使え」運用依存 | SYSTEM 毎分 + RemoteDisconnect で console 回収 |
| API 半死 | すぐステーション Kill（＝また OTP） | **梯子**: soft wait → cooldown 付き1回だけ再起動 → それでもダメなら `needs_otp` を AQUA へ |
| 仕事場で気づけない | kabu-check を自分で開くのみ | 場中 GHA `ops-watch` がメール（要OTP / ティック枯れ） |
| sync 死なのに trade | 分離タスク | atomic market-tick（sync 失敗なら trade しない） |

## 信頼性マトリクス

| 層 | あるもの | ないもの（残リスク） |
|----|----------|----------------------|
| 収集 | kabuStation → bridge sync → Cosmos | 証券側メンテ |
| 判断・回復 | SYSTEM `run-auto-judge` 毎分（Disc回収＋梯子） | Azure ホスト全滅 |
| 発注 | market-tick / LIVE は発注窓のみ / buySkips | 条件未達の日は intents=0（正常な見送り） |
| 同日内リトライ | soft 再試行・cooldown 後の1回再起動・5分 tick | Kill 連打は禁止（OTP 地獄） |
| 朝・可见検知 | kabu-check 自動判断項目 + メール ops-watch | プッシュ通知アプリは未実装 |
| オラクル | `Verify-KabuOpsOnVm.ps1` / `api-recover.log` / `recoveryStatus` | |

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

## 自動判断の見方（aquacore）

`bridgeMeta.recoveryStatus`:

| 値 | 意味 | 仕事場でやること |
|----|------|------------------|
| `ok` / `soft_ok` / `restarted_ok` | 自動側で復帰 | 何もしない（ページ確認のみ） |
| `needs_otp` | 再起動してもトークン不可 | Tailscale で OTP のみ |
| （無し） | まだ報告前 | VM 起動直後は待って再読込 |
