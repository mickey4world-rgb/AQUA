# 行政事業レビュー（お金の流れ）データ

出典: 内閣官房 行政改革推進本部事務局  
「行政事業レビューシートの主要事項のデータベース」（CC BY 4.0）  
https://www.gyoukaku.go.jp/review/database/index.html

## 同梱ファイル

| ファイル | 内容 |
| --- | --- |
| `fy2019.json.gz` 〜 `fy2022.json.gz` | 主要事項データベース（令和2〜5年度シート）由来 |
| `fy2024.json.gz` / `fy2025.json.gz` | 見える化サイト「5-1 支出情報」CSV 由来 |
| `summary.json` | 府省庁別合計・上位支出先などの軽量サマリ |

## 2023 年度など未収録年の追加

[行政事業レビュー見える化サイト](https://rssystem.go.jp/download-csv) の `5-1_RS_YYYY_支出先_支出情報.zip` を
`data-src/rs/` に置き、次で `fyYYYY.json.gz` を生成します（ファイルがあれば年度セレクトに自動反映）。

## 法人番号連携

環境変数 `HOUJIN_BANGOU_APP_ID`（国税庁 Web-API の無料アプリ ID）を設定すると、
レビューに無い企業も法人番号・住所付きで一覧表示し、所在地付近の自治体名支出先を併記します。

## 再生成

リポジトリ直下で:

```bash
# 主要事項 DB（〜fy2022）
py tools/build_review_dataset.py data-src/R05.xlsx frontend/data/gyosei/fy2022.json.gz

# 見える化サイト CSV（fy2024/2025 など）
py tools/build_rs_dataset.py data-src/rs frontend/data/gyosei

# サマリ
py tools/build_review_summary.py frontend/data/gyosei
```

単位入力が疑わしい事業は `suspect=1` として集計から除外しています。
RS 側は単一契約が 1,000 億円超の行を疑わしいとしてマークします。
