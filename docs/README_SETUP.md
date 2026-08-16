# 環境構築マニュアル（AQUA / ClaudeCodeWork）

> **目的**: 別の端末でも本プロジェクトを再現できるように、開発に必要なツールのインストールと初期設定手順をまとめた備忘録です。  
> **対象リポジトリ**: [mickey4world-rgb/AQUA](https://github.com/mickey4world-rgb/AQUA)  
> **本番 URL**: https://www.aquacore.net

---

## 目次

1. [全体の流れ](#全体の流れ)
2. [必須ツールのインストール](#必須ツールのインストール)
3. [Git の初期設定](#git-の初期設定)
4. [GitHub の準備](#github-の準備)
5. [Azure の準備](#azure-の準備)
6. [プロジェクトの取得と起動（参考）](#プロジェクトの取得と起動参考)
7. [よくあるトラブル](#よくあるトラブル)

---

## 全体の流れ

新しい PC で開発を始める場合、おおむね次の順番で進めます。

```
① 必須ツールをインストール（Cursor / Node.js / Git / Azure CLI）
    ↓
② Git のユーザー名・メールアドレスを設定
    ↓
③ GitHub アカウントを用意し、ローカル PC と接続
    ↓
④ Azure CLI で az login し、Azure にログイン
    ↓
⑤ リポジトリを clone して npm install → 開発開始
```

---

## 必須ツールのインストール

### 1. Cursor（エディタ + AI 開発環境）

**Cursor** は VS Code ベースの AI 統合エディタです。本プロジェクトではコード編集・AI アシスタント（Claude 等）の利用に使用します。

#### インストール方法

1. 公式サイトにアクセス: https://cursor.com/
2. **Download** から OS に合ったインストーラーをダウンロード
   - **Windows**: `.exe` インストーラー
   - **macOS**: `.dmg` または Homebrew（`brew install --cask cursor`）
3. インストーラーの指示に従ってインストール
4. 初回起動時に Cursor アカウントを作成（または GitHub / Google でサインイン）

#### 確認方法

Cursor は GUI アプリのため、コマンドでのバージョン確認は必須ではありません。  
インストール後、アプリが起動できれば OK です。

ターミナルから CLI を使う場合（任意）:

```powershell
cursor --version
```

---

### 2. Claude Code（Cursor 内の AI エージェント）

**Claude Code** は Cursor 上で動作する AI コーディングエージェントです。  
チャットで指示を出し、コードの生成・修正・デバッグを支援します。

#### セットアップ方法

1. Cursor を起動
2. 左サイドバーの **Chat（チャット）** または **Agent** パネルを開く
3. モデル選択で **Claude** 系モデルを選択（利用プランに応じて表示されます）
4. プロジェクトフォルダ（clone した `ClaudeCodeWork` など）を **File → Open Folder** で開く

#### 使い方の例

- 「このエラーを直して」
- 「`/space` に新しいタブを追加して」
- 「ビルドが通るか確認して」

> **補足**: Cursor の Agent 機能が、本マニュアルで言う「Claude Code」に相当します。  
> 別途ターミナル用 CLI ツールを使う場合は、Cursor 公式ドキュメントを参照してください。

---

### 3. Node.js（LTS 推奨）

本プロジェクトのフロントエンド（Next.js）は **Node.js** が必要です。  
**LTS（Long Term Support）版** を推奨します。

#### インストール方法

**Windows**

1. https://nodejs.org/ にアクセス
2. **LTS** 版（例: 22.x LTS）をダウンロード
3. インストーラーを実行（「Add to PATH」にチェックが入っていることを確認）

**macOS（Homebrew 利用時）**

```bash
brew install node@22
```

#### 確認方法

ターミナル（Windows: PowerShell / macOS: Terminal）で実行:

```powershell
node -v
```

期待する出力例:

```
v22.x.x
```

```powershell
npm -v
```

期待する出力例:

```
10.x.x
```

> **注意**: `node` も `npm` もバージョン番号が表示されればインストール成功です。

---

### 4. Git

ソースコードのバージョン管理に **Git** を使用します。

#### インストール方法

**Windows**

1. https://git-scm.com/download/win にアクセス
2. インストーラーをダウンロードして実行
3. 基本的にはデフォルト設定のままで OK（PATH に Git を追加するオプションを有効に）

**macOS**

```bash
# Xcode Command Line Tools に含まれる場合もあります
xcode-select --install

# または Homebrew
brew install git
```

#### 確認方法

```powershell
git --version
```

期待する出力例:

```
git version 2.x.x.windows.x
```

---

### 5. Azure CLI（az CLI）

Azure リソースの確認・デプロイ・ログインに **Azure CLI** を使用します。

#### インストール方法

**Windows**

1. https://learn.microsoft.com/ja-jp/cli/azure/install-azure-cli-windows にアクセス
2. **MSI インストーラー** または `winget` でインストール

```powershell
winget install -e --id Microsoft.AzureCLI
```

**macOS**

```bash
brew install azure-cli
```

#### 確認方法

```powershell
az --version
```

期待する出力例（先頭数行）:

```
azure-cli                         2.x.x
...
```

> バージョン情報が表示されればインストール成功です。

---

## Git の初期設定

Git を初めて使う PC では、**コミット時に記録される名前とメールアドレス** を設定します。  
GitHub に登録したメールアドレスと揃えると管理しやすくなります。

### ユーザー名の設定

```powershell
git config --global user.name "あなたの名前"
```

例:

```powershell
git config --global user.name "Mickey Yamada"
```

### メールアドレスの設定

```powershell
git config --global user.email "your-email@example.com"
```

例:

```powershell
git config --global user.email "mickey@example.com"
```

### 設定の確認

```powershell
git config --global --list
```

`user.name` と `user.email` が表示されれば OK です。

### （任意）デフォルトブランチ名を main にする

```powershell
git config --global init.defaultBranch main
```

---

## GitHub の準備

### 1. GitHub アカウントの作成

1. https://github.com/ にアクセス
2. **Sign up** からアカウントを作成
3. メールアドレスの確認を完了

### 2. ローカル PC から GitHub へ接続する

GitHub へ `git push` / `git pull` するには、**認証方式** の設定が必要です。  
初心者には **HTTPS + Personal Access Token（PAT）** または **SSH 鍵** のどちらかが一般的です。

---

#### 方法 A: HTTPS + Personal Access Token（手軽）

**① PAT（トークン）を作成**

1. GitHub にログイン
2. 右上アイコン → **Settings**
3. 左メニュー最下部 **Developer settings** → **Personal access tokens** → **Tokens (classic)**
4. **Generate new token (classic)** をクリック
5. スコープで最低限 **repo** にチェック
6. 生成されたトークンを**安全な場所にコピー**（再表示不可）

**② リポジトリを clone**

```powershell
cd C:\Projects
git clone https://github.com/mickey4world-rgb/AQUA.git ClaudeCodeWork
cd ClaudeCodeWork
```

**③ push 時の認証**

- ユーザー名: GitHub のユーザー名
- パスワード: 上記で作成した **PAT**（GitHub のログインパスワードではない）

---

#### 方法 B: SSH 鍵（推奨・一度設定すれば楽）

**① SSH 鍵を生成**

```powershell
ssh-keygen -t ed25519 -C "your-email@example.com"
```

Enter を数回押してデフォルトのまま進めて OK です。

**② 公開鍵を GitHub に登録**

```powershell
# Windows（PowerShell）
Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub
```

表示された文字列（`ssh-ed25519 AAAA...`）をコピーし、GitHub → **Settings** → **SSH and GPG keys** → **New SSH key** に貼り付けます。

**③ 接続テスト**

```powershell
ssh -T git@github.com
```

成功例:

```
Hi mickey4world-rgb! You've successfully authenticated...
```

**④ SSH で clone**

```powershell
git clone git@github.com:mickey4world-rgb/AQUA.git ClaudeCodeWork
```

---

## Azure の準備

本プロジェクトは **Azure Static Web Apps**、**Azure OpenAI**、**Cosmos DB** などを利用しています。  
Azure リソースの確認や CLI 操作には `az login` による認証が必要です。

### 1. Azure CLI でログイン

ターミナルで実行:

```powershell
az login
```

- ブラウザが自動で開き、Microsoft アカウント（Azure サブスクリプションに紐づくアカウント）でサインインします
- 複数サブスクリプションがある場合は、表示された一覧から使う ID を選びます

### 2. ログイン状態の確認

```powershell
az account show
```

アカウント名・サブスクリプション ID などが JSON で表示されればログイン成功です。

### 3. （任意）使用するサブスクリプションを切り替え

```powershell
az account list --output table
az account set --subscription "サブスクリプション名またはID"
```

### 4. 本プロジェクトで使う主な Azure リソース（参考）

| リソース | 名前 |
|---|---|
| リソースグループ | `rg-personal-apps-prod` |
| Static Web App | `swa-personal-apps-prod` |
| 本番 URL | https://www.aquacore.net |
| Azure OpenAI | `openai-personal-apps-prod` |
| Cosmos DB | `cosmos-personal-apps-prod`（DB: `personal-apps`） |
| Gemini 中継 Functions | `func-gemini-proxy-aqua`（Japan East） |

> 詳細なアーキテクチャ・API・データ設計は [`docs/DESIGN.md`](./DESIGN.md) を参照してください。

---

## プロジェクトの取得と起動（参考）

環境構築が完了したら、次の手順でローカル開発を開始できます。

### 1. リポジトリの clone

```powershell
git clone https://github.com/mickey4world-rgb/AQUA.git ClaudeCodeWork
cd ClaudeCodeWork
```

### 2. 依存パッケージのインストール

```powershell
cd frontend
npm install
```

### 3. 開発サーバーの起動

```powershell
npm run dev
```

ブラウザで http://localhost:3000 を開きます。

### 4. ビルド確認（任意）

```powershell
npm run build
```

エラーなく完了すれば、本番デプロイ前のビルドも問題ありません。

### 5. Cursor でプロジェクトを開く

1. Cursor を起動
2. **File → Open Folder**
3. clone した `ClaudeCodeWork` フォルダを選択

### 6. 環境変数（ローカル開発）

本番と同様の機能を試すには `frontend/.env.local` に秘密情報を設定します。  
項目の一覧・意味は [`docs/DESIGN.md`](./DESIGN.md) の「データ設計」「AI 利用方針」を参照してください。

最低限ローカルで必要になりやすい例:

| 変数 | 用途 |
|---|---|
| `COSMOS_ENDPOINT` / `COSMOS_KEY` | Cosmos DB 接続 |
| `GEMINI_API_KEY` | Gemini 直叩き（日本ローカル） |
| `AZURE_OPENAI_ENDPOINT` / `AZURE_OPENAI_API_KEY` | Azure OpenAI |
| `AZURE_OPENAI_DEPLOYMENT` | 既定デプロイ（例: `stock-advice`） |
| `AZURE_FOUNDRY_CLAUDE_RESOURCE` | Foundry リソース名 |
| `AZURE_FOUNDRY_CLAUDE_API_KEY` | Foundry Project API key |
| `SOLUNA_CLAUDE_DEPLOYMENT` | Claude デプロイ名（Foundry で付けた名前） |
| `SOLUNA_LUNA_DEPLOYMENT` | Soluna 用 Azure OpenAI デプロイ（例: `council-gpt5`） |
| `SOLUNA_OPENAI_DEPLOYMENT_ADVANCED` | 知能 Lv.3 用 Azure 最新デプロイ（任意） |
| `SOLUNA_GEMINI_MODEL_ADVANCED` | 知能 Lv.3 用 Gemini（任意） |
| `SOLUNA_CLAUDE_DEPLOYMENT_ADVANCED` | 知能 Lv.3: `claude-opus-5` 等 |
| `SOLUNA_CLAUDE_DEPLOYMENT_FABLE` | Lv.3 で Fable 5 を使う場合（`claude-fable-5`） |

#### 知能 Lv. 別 推奨モデル（Azure 上でデプロイ → 環境変数に設定）

| 知能 | 親密度 | Azure OpenAI | Foundry Claude |
|---|---|---|---|
| Lv.1 | 0–40 | `gpt-4o-mini` 等 | `claude-haiku-4-5` |
| Lv.2 | 41–80 | **`council-gpt5`**（GPT-5 系） | `claude-sonnet-5` |
| Lv.3 | 81–100 | **`council-gpt5`**（GPT-5.5 等） | **`claude-opus-5`** または `claude-fable-5` |

> **Mythos 5**（`claude-mythos-5`）は Glasswing 等の **限定アクセス** 向け。一般 Soluna では Opus / Fable を推奨。  
> 本番は既に `SOLUNA_OPENAI_DEPLOYMENT_ADVANCED=council-gpt5` 設定済み。

> **Claude は Azure AI Foundry 経由を推奨**（Azure 請求・個人 Anthropic 契約不要）。  
> 代替: `ANTHROPIC_API_KEY`（Anthropic 直 API）もフォールバック可。

> 本番 SWA（East Asia）から Gemini を使う場合は `GEMINI_RELAY_URL` / `GEMINI_RELAY_KEY` が必要です。  
> Soluna の Azure OpenAI は **global リージョン**（`AZURE_OPENAI_ENDPOINT_GLOBAL` 等）を利用します。

#### Soluna 本番環境変数（Azure Portal → SWA → 構成）

モデル自動判断の仕組み（ルーティング・コスト調整・プロンプト設計）: [`docs/SOLUNA_MODEL_ROUTING.md`](./SOLUNA_MODEL_ROUTING.md)

**Claude（Azure AI Foundry — 推奨）**

| 変数 | 取得場所 |
|---|---|
| `AZURE_FOUNDRY_CLAUDE_RESOURCE` | [ai.azure.com](https://ai.azure.com/) のリソース名 |
| `AZURE_FOUNDRY_CLAUDE_API_KEY` | Foundry → Home → **Project API key** |
| `SOLUNA_CLAUDE_DEPLOYMENT` | Foundry → Models → Claude のデプロイ名 |

**その他**

| 変数 | 例 |
|---|---|
| `GEMINI_RELAY_URL` / `GEMINI_RELAY_KEY` | Japan East 中継（既存） |
| `SOLUNA_LUNA_DEPLOYMENT` | `council-gpt5` |

#### Azure Foundry で Claude をデプロイする手順

1. [Azure AI Foundry Portal](https://ai.azure.com/) を開く
2. プロジェクト / リソースを選択（または新規作成）
3. **Build → Models → Deploy model → Claude**（例: Claude Sonnet 4.6）
4. デプロイ名をメモ → `SOLUNA_CLAUDE_DEPLOYMENT`
5. Home の **Project API key** → `AZURE_FOUNDRY_CLAUDE_API_KEY`
6. リソース名 → `AZURE_FOUNDRY_CLAUDE_RESOURCE`

```powershell
az staticwebapp appsettings set `
  --name swa-personal-apps-prod `
  --resource-group rg-personal-apps-prod `
  --setting-names `
    AZURE_FOUNDRY_CLAUDE_RESOURCE=<resource-name> `
    AZURE_FOUNDRY_CLAUDE_API_KEY=<foundry-api-key> `
    SOLUNA_CLAUDE_DEPLOYMENT=claude-sonnet-4-6
```

### 7. Cosmos DB コンテナの初回作成

Cosmos アカウント作成後、機能ごとに **1 回だけ** セットアップスクリプトを実行します。  
`frontend/` で `COSMOS_ENDPOINT` と `COSMOS_KEY` を設定したうえで:

```powershell
cd frontend
npm run setup:token-usage      # TokenUsage
npm run setup:access-logs      # AccessLogs
npm run setup:page-view-logs   # PageViewLogs（公開ページ計測）
npm run setup:work-notes       # WorkNotes（WORKS AI 相談メモ）
npm run setup:soluna           # SolunaRecords + SolunaTokens
```

ユーザー初期データ:

```powershell
npm run seed:users
```

---

## よくあるトラブル

### `node` / `npm` が認識されない

- ターミナルを**一度閉じて開き直す**
- Node.js インストール時に PATH へ追加されているか確認
- Windows: 「システム環境変数」→ Path に Node.js のパスがあるか確認

### `git push` で認証エラー

- HTTPS の場合: パスワード欄には **PAT** を入力（GitHub ログインパスワードではない）
- SSH の場合: `ssh -T git@github.com` で接続テスト

### `az login` 後もリソースが見えない

- 正しいサブスクリプションが選ばれているか `az account show` で確認
- `az account set --subscription "..."` で切り替え

### `npm install` が失敗する

- Node.js が **LTS** 版か確認（`node -v`）
- プロジェクトルートではなく **`frontend/` ディレクトリ** で実行しているか確認

### Soluna / WORKS 相談で「Cosmos DB が未設定」

- 本番: `npm run setup:soluna` / `setup:work-notes` を実行済みか確認
- SWA アプリ設定に `COSMOS_ENDPOINT` / `COSMOS_KEY` があるか確認

### Gemini が「high demand」で失敗する

- 一時的な混雑です。自動リトライ・代替モデル・OpenAI フォールバック（訴訟記録ノート等）が入っています
- 数分後に再試行するか、UI で OpenAI を選択

---

## チェックリスト（コピー用）

新 PC のセットアップが終わったら、以下を確認してください。

- [ ] Cursor が起動できる
- [ ] `node -v` / `npm -v` が表示される
- [ ] `git --version` が表示される
- [ ] `az --version` が表示される
- [ ] `git config --global user.name` / `user.email` を設定した
- [ ] GitHub に clone / push できる（PAT または SSH）
- [ ] `az login` が成功する
- [ ] `frontend/` で `npm install` と `npm run dev` が動く
- [ ] （本番運用時）Cosmos セットアップスクリプトを必要分実行した

---

## 関連ドキュメント

| ファイル | 内容 |
|---|---|
| [`docs/DESIGN.md`](./DESIGN.md) | システム設計・アーキテクチャ |
| [`frontend/README.md`](../frontend/README.md) | Next.js フロントエンドの概要 |

---

*最終更新: 2026-08-16*
