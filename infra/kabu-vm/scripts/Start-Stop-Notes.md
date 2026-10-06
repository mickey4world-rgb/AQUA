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
| 手動バッチ | 任意 | `C:\kabu-setup\Sync-Now.cmd`（probe+sync。引数 `trade` で発注も） |

## sync / trade は毎回手動不要（自動化済）

**結論: VM 起動のたびに `npm run sync` を手で叩く必要はない。**  
ただし **OTP 直後に GUI 緑なのに AQUA が赤／未同期** のときは、ステーション再起動 or `Sync-Now.cmd` が必要だった（下記「朝の失敗パターン」）。

| タイミング | タスク / バッチ | 内容 |
|------------|-----------------|------|
| ログオン後 ~3分 | `kabu-bridge-logon-sync` | **wait-ready（最大90分・OTP待ち）** → probe → health → sync |
| ログオン後 ~4分 | `kabu-bridge-logon-trade` | wait-ready → trade |
| 07:05〜 15分ごと | `kabu-bridge-sync` / `kabu-bridge-trade` | health+sync / trade（Daily 起点・Parallel） |
| 手動ワンショット | `C:\kabu-setup\Sync-Now.cmd` | wait-ready(5分)→probe+health+sync（`trade` 引数で発注も） |
| 外出先ログイン | Tailscale → Windows App → 株ステーション OTP | 公開 RDP なし。手順 `docs/STOCK_KABU_PHONE_LOGIN.md` |
| 緑マーク確認 | 携帯 → `https://www.aquacore.net/costs/kabu-check` | AQUAログイン＋確認PIN。トークン成功＝API緑相当 |

再登録: `powershell -File C:\kabu-setup\Ensure-KabuSyncAutomation.ps1`  
（リポ更新後は `Ensure-KabuSyncAutomation.ps1` と `C:\kabu-bridge` を最新にして再実行）  
ログ: `C:\kabu-setup\wait-ready.log` / `sync.log` / `trade.log` / `manual-sync.log`

**失敗時の見方**:
- `token failed: HTTP 401` → `.env` の `KABU_API_PASSWORD` 不一致
- GUI 緑なのに token タイムアウト／接続失敗 → **株ステーションを再起動**してから `Sync-Now.cmd`
- RDP の × 切断後に全滅 → `Disconnect-Rdp-KeepDesktop.bat`（tscon）を使う

### 朝の失敗パターン（実例）

症状: 朝 OTP → GUI 緑 → でも sync/trade せず。11時にバッチしてもダメ。昼にステーション再起動＋バッチで初めて認識。

| 原因クラス | 説明 | 6:30起動で直る？ |
|------------|------|------------------|
| A. OTP前の失敗連打 | AutoLogon直後は未ログイン。旧タスクは即死するだけなら害は小さい | 一部（無駄失敗が減る） |
| B. APIハング＋IgnoreNew | token fetch が固まると 15分タスクが後続全部スキップ | **直らない**（タイムアウト＋Parallel で対処） |
| C. 緑でも API 半死 | GUI緑アイコンでも `/kabusapi/token` が応答しないことがある | **直らない**（ステーション再起動） |
| D. RDP×切断 | 携帯 Windows App を×で閉じるとデスクトップ描画が死に APIも死ぬ | **直らない**（tscon） |
| E. 定期トリガー取りこぼし | 旧「Once@00:02繰り返し」は deallocate 明けに弱い | 一部（Daily 06:45 起点へ変更） |

**6:30起動は「OTP直前に寄せる」改善にはなるが、B/C/D の本丸ではない。**  
本丸は wait-ready・fetch タイムアウト・タスク Parallel・緑でもダメなら再起動。
| RDP×ではなく tscon | **必須** | Azure では切断でデスクトップ描画が止まり GUI/API が死ぬことが多い |
| スクセ／スリープ無効 | **必須** | ロックで同様に止まる |
| セッション時間制限なし | **必須**（Windows Server） | 切断・アイドルで強制サインアウトされうる |

初期は手動 RDP でも可。無人化するなら下の順番で揃える。

## 推奨手順（VM 内・管理者 PowerShell）

```powershell
# 手元 PC のリポ上で実行する場合の例（VM 上にはこのパスは無い）
# cd <repo>\infra\kabu-vm\scripts
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

### B. Automation Account（適用済スクリプト）

`scripts/Deploy-WeekdayVmStart.ps1` で Japan East に Automation Account を作成し:

- Runbook: `Start-KabuVm`（Managed Identity で Start-AzVM）
- スケジュール: **月–金 07:00 JST**（勤務先から遠隔 OTP する前提）
- 停止: 既存 Auto-shutdown **毎日 16:30 JST**（deallocate）に任せる

```powershell
pwsh infra/kabu-vm/scripts/Deploy-WeekdayVmStart.ps1
```

朝 Start 後、AutoLogon → スタートアップ kabu → wait-ready（OTP待ち）→ 勤務先から Tailscale OTP → sync、の順。

### C. 使わないもの

- **Spot VM**（取引中に強制停止されうる）
- **Bastion 常設**（初期コストが大きい）— 必要なら後から
- **kabu ポートのインターネット公開**
- **パスワードを .bat / リポジトリに平文保存**（必ず Autologon.exe）

## 明日の本番開始チェック（JST）

VM 無人化適用後の朝の確認:

1. Portal で VM が **実行中**（AutoLogon 済みなら aquaadmin が console Active）
2. RDP で入り、kabuステーション **API アイコン緑**（検証 18081）を目視
3. 切るときは × ではなく `C:\kabu-setup\Disconnect-Rdp-KeepDesktop.bat`
4. `.env`: `KABU_ALLOW_LIVE_ORDERS=1`・`KABU_TRADE_PASSWORD` 設定済みであること
5. コスト画面に **日本株ウォッチ** があること（無いと intents=0）
6. `C:\kabu-setup\sync.log` / `trade.log` にエラーが無いこと

初回は検証ポート 18081 のまま LIVE 発注。問題なければ後で 18080 に切替。


AutoLogon はディスク上に認証情報を置く。許容条件:

- 取引専用 VM
- NSG で RDP は自宅 `/32` または JIT
- 18080/81 は inbound 拒否のまま
- LIVE 発注は別ゲート（`KABU_ALLOW_LIVE_ORDERS`）
