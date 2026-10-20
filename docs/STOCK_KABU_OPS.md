# 日本株自動売買 — 運用保守（不変条件）

## ユーザー可见の不変条件

**仕事場からは OTP（と aquacore 閲覧）以外ほぼできない。** その前提で:

**平日、朝に OTP を1回入れたあと、場中は人手のステーション再起動なしに:**

1. 余力・保有の **sync** が続く  
2. **market-tick**（SYSTEM・sync→trade）が約5分ごとに回り、条件を満たせば **LIVE 発注**が Cosmos / Costs に残る（後場は **15:30** まで）  
3. 同期が死んだら **Disc→console と soft wait のみ**（ステーション再起動はしない）→ だめなら aquacore/メールで OTP 要求  
4. 止まっているときは `/costs/kabu-check` が **自動売買準備OK ではない** と理由付きで示す  

「タスクが登録されている」「API 200」「Verify 緑」「intents>0」「rejected をログした」だけでは成功にしない。  
**成功は LIVE `submitted`（できれば約定）が残ること。** 緑のステーションを Kill しない。

**利益優先（2026-10-20）:** 買ってすぐの赤字売り禁止。損切りは保有1年超のみ（仮想通貨と同契約）。月次損失上限は **45万円**（4.5万は誤り）。損失サーキットで売買停止・全決済はしない。

### 反省（2026-10・約15日ゼロ約定）

層を直すたびに「次の層の代理指標」で完了扱いにした。経路は動いていた日もあるが、発注ボディ（AA→100204、Exchange=1→100378）と成功定義の誤りで **受理ゼロ**が続いた。  
以後の完了条件: 場中 OTP 済みで `submitted` か、提出ゼロなら **層名付きブロッカー**（needs_otp / tick死 / intents=0 / Code=…）を明示。

## 検討メモ（何が足りなかったか）

不足の本丸はスクリプトの本数ではなく、**閉ループ（検知→判断→OTP不要な回復→結果を aquacore に出す）** だった。  
「半死だから Kill→再起動」は **OTP 地獄**であり対策ではない（2026-10-15 再発で確定）。

| 失敗クラス | 旧 | 新 |
|------------|----|----|
| ×切断で Disc | 「4 を使え」運用依存 | SYSTEM 毎分 + RemoteDisconnect で console 回収 |
| API 半死 / token 一瞬失敗 | Kill→再起動（＝また OTP） | **Kill 禁止**。soft wait → だめなら `needs_otp` 報告のみ。人手で OTP |
| health が AQUA 報告失敗で exit 1 | Recover が緑を「死」と誤判定 | health の exit は **stationTokenOk のみ** |
| 仕事場で気づけない | kabu-check を自分で開くのみ | 場中 GHA `ops-watch` がメール（要OTP / ティック枯れ / **準備OKなのに LIVE受理ゼロ・拒否連発**） |
| ボディ毒が再発 | 手動で .env を直すのみ | 毎 tick 前 `Heal-CashOrderEnv`（Exchange=1 / FundType=AA / 旧 storm 掃除） |
| sync 死なのに trade | 分離タスク | atomic market-tick（sync 失敗なら trade しない） |
| Disconnect 後 sync 停止 | Interactive タスク依存 | **SYSTEM market-tick** + token OK 時の AQUA sync 枯れ回復 |
| tick が health で終わり sync しない | `npm.cmd` を `call` なしで起動 | 全 run-*.cmd で `call npm.cmd`（Sync-Now と同じ） |
| Sync-Now が Space 待ち | `type \| more` | 末尾は PowerShell Tail（`more`/`pause` 禁止） |
| 07:00 タスクが場後に動く | VM TZ=UTC | Tokyo Standard Time + StartBoundary `+09:00` |
| 15:00 以降を市場外表示 | 旧大引け 15:00 | 大引け **15:30**（2024-11 以降） |
| LIVE 買いが全部 rejected 100204 | `FundType=AA`（信用代用） | 現物買は `FundType=02`（保護預り）。AA は `KABU_ALLOW_CREDIT_FUND=1` 無しでは無視 |
| LIVE 全部 rejected 100378 | `Exchange=1`（東証）または `.env`/`order-defaults` に 1 が残存 | 現物は **27/9のみ**。`normalizeCashExchange`＋発注前 `assertCashOrderShape`＋`npm run assert-order-shape`。拒否時 autofix＋学習毒の自動治癒 |
| 1コード直して翌日別コード全拒否 | 横展開せず単項目パッチ | `cash-order-shape.mjs` に全現物フィールド不変条件。拒否コード辞書で DelivType/FundType も autofix |
| token 一瞬失敗で trade プロセス落ち | 未 catch の throw | token 失敗は `_CHECK_` 記録して exit（次 tick で再試行） |
| 高値銘柄が安値判定なのに単元不足 | 第1層建玉上限（損切り8%換算） | 1取引損失上限を 2.5万円に緩和（建玉≈31万円・単価〜約3,125円）。それ超は残余リスク |

## 朝OTPの自動化（調査結論・2026-10）

公式（kabusapi Issue #1106 / #1002 / #1276）:

| 問い | 公式回答 |
|------|----------|
| 固定IP・信頼端末で OTP 免除？ | **提供しない**（セキュリティ強化方針） |
| 早朝メンテ後もセッション維持？ | **不可**。毎朝ログインが必要 |
| API 呼び出し時に OTP？ | **不要**。必要なのは kabuステーション GUI ログイン時のみ |
| サーバー無人運用は禁止？ | **禁止ではないが非推奨・非保証** |

したがって「OTP 入力そのものの完全無人化」は、公式手段がなく、UI 自動入力も規約・セキュリティ上おすすめできない。

**価値がある自動化（現実解）** は次に限る:

1. VM 起動・AutoLogon・ステーション起動・wait-ready までは既に自動化
2. `needs_otp` をメール／kabu-check で確実に気づく（ops-watch）
3. 携帯 Tailscale → OTP 1回だけの所要時間を最短化（手順固定）
4. ログイン後は Kill 禁止で場中維持（再OTPを発生させない）

「何としても OTP をプログラム入力」は調査の結果、**採用しない**（公式拒否＋メンテで毎朝リセット）。

## 信頼性マトリクス

| 層 | あるもの | ないもの（残リスク） |
|----|----------|----------------------|
| 収集 | kabuStation → bridge sync → Cosmos | 証券側メンテ |
| 判断・回復 | SYSTEM `run-auto-judge` 毎分（Disc回収＋soft wait＋報告） | Azure ホスト全滅 |
| 発注 | market-tick / LIVE は発注窓のみ / buySkips | 条件未達の日は intents=0（正常な見送り） |
| 同日内リトライ | soft 再試行・5分 tick | **ステーション Kill/再起動は禁止**（OTP 地獄） |
| 朝・可见検知 | kabu-check 自動判断項目 + メール ops-watch | プッシュ通知アプリは未実装 |
| オラクル | `Verify-KabuOpsOnVm.ps1` / `api-recover.log` / `recoveryStatus` | |

## 平日オペ（Mickey）

**東証現物の営業日のみ** VM が 07:00 起動（土日祝・年末年始はランブックが Start スキップ。例: 2026-10-12 スポーツの日）。

1. 07:00 VM 自動起動 → AutoLogon → ステーション起動待ち  
2. 勤務先から Tailscale → **OTP 1回** → GUI 緑  
3. `3 Sync-Now`（sync→trade）または待つ（logon wait-ready + market-tick）  
4. `/costs/kabu-check` で **自動売買準備OK**  
5. 切断: `4 Disconnect` 推奨（×でも約1分で自動回収）  
6. 以降は aquacore 確認のみ。再ログインは `needs_otp` のときだけ  


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

成功マーカー: `KEEP_SELFTEST_OK` / `TASK_OK_SYSTEM`（console-keepalive + **market-tick**） / `UPDATE_BRIDGE_OK`

## 自動判断の見方（aquacore）

`bridgeMeta.recoveryStatus`:

| 値 | 意味 | 仕事場でやること |
|----|------|------------------|
| `ok` / `soft_ok` / `restarted_ok` | 自動側で復帰 | 何もしない（ページ確認のみ） |
| `needs_otp` | 再起動してもトークン不可 | Tailscale で OTP のみ |
| （無し） | まだ報告前 | VM 起動直後は待って再読込 |
