# gemini-proxy

WORKS の AI 相談が使う Gemini API への中継。Japan East の Azure Functions（Flex Consumption）で動く。

## なぜ必要か

Azure Static Web Apps が選べるリージョンは Central US / East US 2 / West US 2 / West Europe / East Asia のみで、日本がない。
Cosmos DB を Japan East に置いている都合上 East Asia（香港）を使っているが、Google はこの地域からの Gemini API 呼び出しを拒否する。

```
User location is not supported for the API use.
```

米国リージョンへ移せば Gemini は通るが、今度は全アプリの Cosmos DB アクセスが太平洋を横断する。
そこで Gemini の呼び出しだけを Japan East 経由にする。

## 構成

- `func-gemini-proxy-aqua`（rg-personal-apps-prod / Japan East / Flex Consumption FC1 / Node 22）
- `GEMINI_API_KEY` はこの Function App 側だけが持つ。Static Web Apps には持たせなくてよい。
- エンドポイント: `POST /api/gemini`（`x-functions-key` ヘッダーで認証）

リクエストとレスポンスは Gemini のものをそのまま素通しする。呼び出し側の
`frontend/lib/server/gemini.ts` が `GEMINI_RELAY_URL` と `GEMINI_RELAY_KEY` の両方を
見つけたときだけ中継を使い、無ければ Google を直接叩く（日本国内のローカル開発用）。

```json
{
  "model": "gemini-flash-latest",
  "body": { "contents": [], "generationConfig": {} }
}
```

## デプロイ

`Compress-Archive` はエントリ名をバックスラッシュ区切りで書くため Linux 側で展開できない。
ZIP は必ずスラッシュ区切りで作ること。

```powershell
npm install --omit=dev

Add-Type -AssemblyName System.IO.Compression.FileSystem
$src = (Resolve-Path .).Path
$out = "..\gemini-proxy-v2.zip"
if (Test-Path $out) { Remove-Item $out }
$zip = [System.IO.Compression.ZipFile]::Open($out, 'Create')
Get-ChildItem -Path $src -Recurse -File |
  Where-Object { $_.Name -ne '.funcignore' -and $_.Name -ne 'README.md' } |
  ForEach-Object {
    $rel = $_.FullName.Substring($src.Length + 1).Replace('\', '/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $rel) | Out-Null
  }
$zip.Dispose()

az functionapp deployment source config-zip `
  -n func-gemini-proxy-aqua -g rg-personal-apps-prod --src ..\gemini-proxy-v2.zip
```

## 関数キーの取り出し

```powershell
az functionapp function keys list `
  -n func-gemini-proxy-aqua -g rg-personal-apps-prod --function-name gemini --query default -o tsv
```
