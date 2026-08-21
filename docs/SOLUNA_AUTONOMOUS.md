# Soluna — 自律運用（ニュースバトル / Note / 街づくり / BOINC / bitFlyer）

> 2026-08 時点の差分化ドキュメント。人間チャット（モデル自動切替）は [`SOLUNA_MODEL_ROUTING.md`](./SOLUNA_MODEL_ROUTING.md) を参照。

## 1. 画面構成（`/soluna`）

| タブ | 役割 |
|------|------|
| あなたと会話 | ソル／ルーナの個人チャット。失敗時はモデル即フェイルオーバー |
| ニュース討伐（全員共通） | 毎朝のニュース→モンスター討伐ログ、仕事デスク（Note / 街づくり / 資産） |

## 2. 朝の自律パイプライン

GitHub Actions: **`Soluna System Briefing`**  
（`.github/workflows/soluna-system-briefing.yml`）

### スケジュール（JST 目標）

| 枠 | cron (UTC) | 意図 |
|----|------------|------|
| 6:00 | `0 21 * * *` | 最速枠 |
| 7:00 | `0 22 * * *` | バックアップ |
| 8:00 | `0 23 * * *` | バックアップ |
| 9:00 | `0 0 * * *` | 従来枠 |

- GitHub Actions の schedule は混雑で遅延し得るため **4枠**。
- API は **JST 同日の二重実行をスキップ**（`force` なしの chat）。

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

## 6. bitFlyer 資産運用（裏稼働）

実装: `frontend/lib/server/soluna-asset-trade.ts`  
GHA: **`Soluna Asset Trade (background)`**（毎時 `:20` UTC）

| 項目 | 内容 |
|------|------|
| SWA 環境変数 | `BITFLYER_API_KEY` / `BITFLYER_API_SECRET`（必須） |
| 判断 | 板・約定・スプレッドから予測スコア。強気時のみ買い |
| 利確 | 硬 +4% / 勢い減衰で +2.5% |
| 損切り | 硬 −3% / 下落加速で −2% |
| DCA 抑制 | 冷却 2h、1日購入上限 2万円、1回最大 1万円 |
| 月次目標 | 実現損益 ≥ 月初×2% でおやすみモード |
| RPG 表現 | 魔力MP・蒼竜(BTC)・守護巨兵(現金) |

**注意**: キー設定後も台帳 `status` が古いと「未設定」に見えることがある。  
Actions で Asset Trade を1回手動実行すると口座同期される。  
UI は `jobs.bitFlyerConfigured` で設定済み／未設定を区別する。

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
| `POST /api/soluna/chat` | 人間チャット |
| `POST /api/soluna/cron/system-briefing` | 朝パイプライン |
| `POST /api/soluna/cron/asset-trade` | bitFlyer 裏稼働 |
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
| systemAssets | bitFlyer 台帳 |
| systemSettlement | 拠点都市 |
| systemPersonality / systemEpisode / systemMeta | 性格・エピソード・最終実行日 |

## 10. 運用チェックリスト

- [ ] SWA: `SOLUNA_CRON_SECRET`, Claude/OpenAI/Gemini, Cosmos, Note, `BITFLYER_*`
- [ ] GitHub Secrets: `SOLUNA_CRON_SECRET`, `BOINC_ACCOUNT_KEY`, Gemini relay（ニュース用）
- [ ] GitHub Vars: `PRODUCTION_URL`, `BOINC_PROJECT_URL`（任意）
- [ ] Actions: Briefing が朝に走る / Asset Trade が毎時走る
- [ ] トラブル時: Briefing / Asset Trade を `workflow_dispatch` で手動実行
