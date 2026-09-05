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
| `public-preview.json` | 公開サンキー表示専用の事前集計スナップショット（オンラインはこれだけ読む） |

## 2023 年度など未収録年の追加

[行政事業レビュー見える化サイト](https://rssystem.go.jp/download-csv) の `5-1_RS_YYYY_支出先_支出情報.zip` を
`data-src/rs/` に置き、次で `fyYYYY.json.gz` を生成します（ファイルがあれば年度セレクトに自動反映）。

## 企業住所の補完

アプリ ID は不要です。支出先名で検索すると次の順で住所を解決します。

1. 同梱レビューデータ（見える化サイト CSV の所在地）
2. OpenStreetMap Nominatim（レビューに住所が無い／載っていない企業）
3. （任意）`HOUJIN_BANGOU_APP_ID` があれば国税庁法人番号 Web-API

付近の自治体表示は、住所近辺の自治体が支出先になっている国の事業と、同じ事業内の当該業者への支出を突き合わせます（地方単独契約そのものではありません）。

支出先の「詳細」では、複数年の国からの受注推移・契約相手・契約方式の偏りに加え、
国交省ネガティブ情報（指名停止・直近5年）、Wikipedia（日英）の評価要約、上場なら株価推移から見た財務不安を示します。
（企業会計の確定損益や全省庁の指名停止を網羅するものではありません。）

## 再生成

リポジトリ直下で:

```bash
# 主要事項 DB（〜fy2022）
py tools/build_review_dataset.py data-src/R05.xlsx frontend/data/gyosei/fy2022.json.gz

# 見える化サイト CSV（fy2024/2025 など）
py tools/build_rs_dataset.py data-src/rs frontend/data/gyosei

# サマリ
py tools/build_review_summary.py frontend/data/gyosei

# 公開プレビュー（オンライン表示用・リクエスト時集計を避ける）
cd frontend && npm run build:gyosei-preview
```

単位入力が疑わしい事業は `suspect=1` として集計から除外しています。
RS 側は単一契約が 1,000 億円超の行を疑わしいとしてマークします。
