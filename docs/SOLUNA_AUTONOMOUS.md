# Soluna — 自律運用（ニュースバトル / Note / 街づくり / BOINC / 資産運用）

> 2026-08 時点の差分化ドキュメント。人間チャット（モデル自動切替）は [`SOLUNA_MODEL_ROUTING.md`](./SOLUNA_MODEL_ROUTING.md) を参照。
>
> **公開ポリシー**: Note・チャット・UI では取引所ブランド名を出さない。資産は「聖なる魔力タンク／召喚獣」など世界観で語る。

## 1. 画面構成（`/soluna`）

| タブ | 役割 |
|------|------|
| あなたと会話 | ソル／ルーナの個人チャット。失敗時はモデル即フェイルオーバー |
| ニュース討伐（全員共通） | 毎朝のニュース→モンスター討伐ログ、仕事デスク（Note / 街づくり / 資産） |
| 画像生成 | ベース立ち絵（`/soluna/characters-base.jpg`）を参考に無料生成・アップロード・削除 |

### 画像スタジオ

- 生成: Gemini でプロンプト整形（任意）→ **Pollinations（無料）** で画像化 → Cosmos に data URL 保管
- モデル選択: `nanobanana-2`（既定・ベース同系統）/ `nanobanana-2-lite` / `flux` / `gptimage` / `turbo` / `sana` / `zimage` / `klein`
- 「ベース画風に合わせる」ON 時は公式立ち絵を `image=` 参照し、依頼場面を先頭に保ったうえで短いスタイルトレーラーを付与（`enhance` はオフ）
- ギャラリー・チャット結果からダウンロード可能。上限: ユーザーあたり 24 枚・1枚約 900KB。ベースは削除不可
- API: `GET/POST /api/soluna/images` · `DELETE /api/soluna/images/[id]` · `POST /api/soluna/images/generate`（`model`, `matchBaseStyle`）

## 2. 朝の自律パイプライン

GitHub Actions: **`Soluna System Briefing`**  
（`.github/workflows/soluna-system-briefing.yml`）

### スケジュール（JST 目標）

| 枠 | cron (UTC) | 意図 |
|----|------------|------|
| 3:00 | `0 18 * * *` | 早朝枠 |
| 4:00 | `0 19 * * *` | 早朝枠 |
| 5:00 | `0 20 * * *` | 早朝枠 |
| 6:00 | `0 21 * * *` | 最速枠（従来） |
| 7:00 | `0 22 * * *` | バックアップ |
| 8:00 | `0 23 * * *` | バックアップ |
| 9:00 | `0 0 * * *` | 従来枠 |
| 12:00 | `0 3 * * *` | 昼キャッチアップ |
| 15:00 | `0 6 * * *` | 午後 |
| 18:00 | `0 9 * * *` | 夕方 |
| 21:00 | `0 12 * * *` | 夜キャッチアップ |

- GitHub Actions の schedule は混雑で **遅延・完全欠落** し得るため朝〜夜の複数枠。
- API は **JST 同日の二重実行をスキップ**（`force` なしの chat / `step=ensure`）。
- さらに **Asset Trade（毎時 :20）** が `step=ensure` を呼び、未実行日だけニュース→討伐→ジョブを補完。

### 処理順

1. **ニュース取得**（`fetch-soluna-news.mjs`）  
   Gemini grounding → 非 grounding → RSS フォールバック  
2. **システムチャット** `POST /api/soluna/cron/system-briefing` `step=chat`  
   ボス＋小物複数戦、旅エリア、ソル／ルーナ掛け合い  
3. **自律ジョブ** `step=jobs`  
   Note 有料記事 / BOINC 分数計画 / 資産台帳反映 / 拠点都市進行  
4. **BOINC 実行**（計画分 > 0 のとき）  
   `frontend/scripts/run-soluna-boinc.sh` → `POST /api/soluna/boinc-report`

## 3. Note 有料記事

- 無料: ニュース要約・冒険日誌ダイジェスト・掛け合い前半＋引き  
- 有料: 白熱会話、バトル結果、**🏡 拠点都市開拓日誌**、ギルド財務（RPG）  
- 環境: `NOTE_COOKIE` / `NOTE_CREATOR_URLNAME` / `NOTE_PRICE_YEN` / `NOTE_EYECATCH_UUID`（SWA）
- **本文に外部画像 URL（aquacore 直リンク等）を入れない**。キャラ画像は見出し（eyecatch）のみ。外部 img は note 公開時に「本文に利用できない内容が含まれています」で拒否される
- ハッシュタグ: 既定 `ソルとルーナ, AIニュース, ニュース解説, 朝活`。SWA `NOTE_HASHTAGS`（カンマ区切り）で上書き可
- 設定案内リンクは文末に URL のみ置く（括弧内 URL だと日本語までリンクが食い込む）
- `/costs` の Soluna タブに Note 投稿日時・PV・スキを表示（購入件数は非公式 API で安定取得不可）

## 4. 拠点都市（街づくり）＝ BOINC 社会貢献の物語化

実装: `frontend/lib/server/soluna-settlement.ts`  
永続: Cosmos `docType: systemSettlement`

累積 BOINC 分数で施設が建ち、合併で村→町→都市へ進化。

| 累積目安 | イベント |
|----------|----------|
| 30分 | 魔導風車【エウルス】 |
| 75分 | 精霊の魔導水路 |
| 135分 | 合併 → 魔導水耕街アクアピア（町）＋分析スロット |
| 220分〜 | 観測塔 → 第2スロット → 都市化 |

## 5. BOINC

- 分数は当日アイテム数と討伐結果から算出（`boincMinutesFromItems`）
- GHA 無料ランナーでクライアント実行
- Secrets: `BOINC_ACCOUNT_KEY`（GitHub）  
  Vars: `BOINC_PROJECT_URL`（任意、既定 World Community Grid）
- RPC 権限・JSON 正規化は `run-soluna-boinc.sh` 側で対応済み

## 6. 資産運用（裏稼働・取引所名は非公開）

実装: `frontend/lib/server/soluna-asset-trade.ts`  
GHA: **`Soluna Asset Trade (background)`**（毎時 `:20` UTC）

| 項目 | 内容 |
|------|------|
| SWA 環境変数 | 資産運用 API Key / Secret（`BITFLYER_*` — 設定名のみ。公開文面には書かない） |
| 対象銘柄 | **BTC_JPY / ETH_JPY / XRP_JPY** を板・約定からスコア化し、強い方を買う。利確・損切りも銘柄別 |
| 追加候補 | Lightning Spot では XLM / MONA / ELF も API 売買可。**FX_BTC_JPY は CFD のため対象外** |
| ジパング(ZPG) | Lightning に市場が無く自動売買不可のため **投資カテゴリから除外** |
| 分散上限 | 現金下限 28% / 単一銘柄 42% / 暗号合計 72%。1回最大1万円・1日購入上限2万円・冷却2h |
| 利確 | 硬 +4% / 勢い減衰で +2.5% |
| 損切り | 硬 −3% / 下落加速で −2% |
| 月次目標 | 実現損益の目安は月初×2%。おやすみモードは月初×10%超で発動 |
| RPG 表現 | 魔力MP・蒼竜(BTC)・不死鳥(ETH)・海竜(XRP)・守護巨兵(現金)。**取引所名は Note/チャット/UI に出さない** |

**注意**: キー設定後も台帳 `status` が古いと「未設定」に見えることがある。  
Actions で Asset Trade を1回手動実行すると口座同期される。  
UI は `jobs.bitFlyerConfigured`（内部フラグ名）で接続済み／未設定を区別する。

## 7. 人間チャット（ソル応答の耐障害）

実装: `frontend/lib/server/soluna-chat.ts`

- ソルは Claude 失敗時、**同一プロバイダ内の代替デプロイ**へ即切替
- 続けて OpenAI / Gemini へフェイルオーバー（ルーナ担当プロバイダも可）
- 全滅時は緊急リトライ（制限なし）
- 初回タイムアウト短め → 切替を優先

## 8. 主要 API

| パス | 用途 |
|------|------|
| `GET /api/soluna/system` | ニュース討伐ログ＋仕事デスク |
| `POST /api/soluna/chat` | 人間チャット（討伐結果・資産運用・BOINC状況を踏まえて応答。取引所名は出さない） |
| `POST /api/soluna/cron/system-briefing` | 朝パイプライン |
| `POST /api/soluna/cron/asset-trade` | 資産運用の裏稼働 |
| `POST /api/soluna/boinc-report` | BOINC 実績保存 |
| `GET /api/costs/soluna-ops` | コスト画面用・資産運用／BOINC 分析 |

認可: `Authorization: Bearer ${SOLUNA_CRON_SECRET}`（cron / report）

## 9. Cosmos（システム側）

同一 `SolunaRecords` コンテナに `docType` で共存:

| docType | 内容 |
|---------|------|
| systemBriefing | 日次ニュース |
| systemMessage | ソル／ルーナ議論 |
| systemHunter | バトル・メダル・レベル |
| systemNoteArticle | Note 原稿／投稿結果 |
| systemBoincRun | BOINC 計画・実績 |
| systemAssets | 資産台帳（魔力タンク） |
| systemSettlement | 拠点都市 |
| systemPersonality / systemEpisode / systemMeta | 性格・エピソード・最終実行日 |

## 10. 運用チェックリスト

- [ ] SWA: `SOLUNA_CRON_SECRET`, Claude/OpenAI/Gemini, Cosmos, Note, 資産運用 API（`BITFLYER_*`）
- [ ] GitHub Secrets: `SOLUNA_CRON_SECRET`, `BOINC_ACCOUNT_KEY`, Gemini relay（ニュース用）
- [ ] GitHub Vars: `PRODUCTION_URL`, `BOINC_PROJECT_URL`（任意）
- [ ] Actions: Briefing が朝に走る / Asset Trade が毎時走る
- [ ] トラブル時: Briefing / Asset Trade を `workflow_dispatch` で手動実行
