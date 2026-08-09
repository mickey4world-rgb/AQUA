# 行政事業レビュー（お金の流れ）データ

出典: 内閣官房 行政改革推進本部事務局  
「行政事業レビューシートの主要事項のデータベース」（CC BY 4.0）  
https://www.gyoukaku.go.jp/review/database/index.html

## 同梱ファイル

| ファイル | 内容 |
| --- | --- |
| `fy2019.json.gz` 〜 `fy2022.json.gz` | 令和2〜5年度シート由来の支出先明細（執行年度は前年度） |
| `summary.json` | 府省庁別合計・上位支出先などの軽量サマリ |

## 2023〜2025 年度の追加

主要事項データベースは令和5年度（執行 2022）までです。それ以降は
[行政事業レビュー見える化サイト](https://rssystem.go.jp/download-csv) の CSV（ZIP）を手動ダウンロードし、
同形式の `fy2023.json.gz` などを生成してください。ファイルがあれば年度セレクトに自動で現れます。

## 法人番号連携

環境変数 `HOUJIN_BANGOU_APP_ID`（国税庁 Web-API の無料アプリ ID）を設定すると、
レビューに無い企業も法人番号・住所付きで一覧表示し、所在地付近の自治体名支出先を併記します。

## 再生成

リポジトリ直下で:

```bash
# 1. 公式サイトから XLSX / ZIP を data-src/ へ取得
# 2. 前処理
py tools/build_review_dataset.py data-src/R05.xlsx frontend/data/gyosei/fy2022.json.gz
py tools/build_review_summary.py frontend/data/gyosei
```

単位入力が疑わしい事業（支出合計が執行額の 100 倍超）は `suspect=1` として集計から除外しています。
