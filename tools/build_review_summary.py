"""年度別データセットから、既定表示用の小さなサマリを作る。

年度ファイルは 1 本 2MB 弱あり、トップ画面のたびに展開したくないので
「府省庁別合計」「全体の上位支出先」など軽い集計だけ別ファイルに切り出す。

    py tools/build_review_summary.py frontend/data/gyosei
"""

from __future__ import annotations

import glob
import gzip
import json
import os
import sys
from collections import defaultdict

TOP_PAYEES = 60
TOP_PAYEES_PER_MINISTRY = 12


def main() -> None:
    directory = sys.argv[1] if len(sys.argv) > 1 else "frontend/data/gyosei"
    paths = sorted(glob.glob(os.path.join(directory, "fy*.json.gz")))
    if not paths:
        raise SystemExit(f"{directory} に fy*.json.gz がありません")

    years = []
    payee_totals: dict[str, float] = defaultdict(float)
    payee_years: dict[str, set[int]] = defaultdict(set)

    for path in paths:
        with gzip.open(path, "rt", encoding="utf-8") as fh:
            data = json.load(fh)

        fiscal_year = data["fiscalYear"]
        ministries = data["dictionaries"]["ministries"]
        payees = data["dictionaries"]["payees"]
        projects = data["projects"]
        flows = data["flows"]

        ministry_amount: dict[int, float] = defaultdict(float)
        ministry_projects: dict[int, set[int]] = defaultdict(set)
        ministry_payees: dict[int, dict[int, float]] = defaultdict(lambda: defaultdict(float))
        total = 0.0
        excluded = 0.0

        for project_index, payee_index, amount, *_ in flows:
            project = projects[project_index]
            if project[6]:  # 単位入力ミスの疑いがある事業は合計から外す
                excluded += amount
                continue
            ministry_index = project[0]
            ministry_amount[ministry_index] += amount
            ministry_projects[ministry_index].add(project_index)
            ministry_payees[ministry_index][payee_index] += amount
            total += amount

            name = payees[payee_index]
            payee_totals[name] += amount
            payee_years[name].add(fiscal_year)

        years.append(
            {
                "fiscalYear": fiscal_year,
                "total": round(total, 1),
                "excluded": round(excluded, 1),
                "projectCount": len(projects),
                "flowCount": len(flows),
                "suspectCount": sum(1 for p in projects if p[6]),
                "ministries": [
                    {
                        "name": ministries[index],
                        "amount": round(amount, 1),
                        "projectCount": len(ministry_projects[index]),
                        "topPayees": [
                            {"name": payees[pi], "amount": round(value, 1)}
                            for pi, value in sorted(
                                ministry_payees[index].items(), key=lambda kv: -kv[1]
                            )[:TOP_PAYEES_PER_MINISTRY]
                        ],
                    }
                    for index, amount in sorted(ministry_amount.items(), key=lambda kv: -kv[1])
                ],
            }
        )
        print(f"fy{fiscal_year}: {total:,.0f} 百万円 / {len(ministry_amount)} 府省庁")

    summary = {
        "unit": "百万円",
        "source": {
            "label": "行政事業レビューシートの主要事項のデータベース",
            "publisher": "内閣官房 行政改革推進本部事務局",
            "license": "CC BY 4.0",
            "url": "https://www.gyoukaku.go.jp/review/database/index.html",
        },
        "years": sorted(years, key=lambda y: y["fiscalYear"]),
        "topPayees": [
            {"name": name, "amount": round(amount, 1), "years": sorted(payee_years[name])}
            for name, amount in sorted(payee_totals.items(), key=lambda kv: -kv[1])[:TOP_PAYEES]
        ],
    }

    out = os.path.join(directory, "summary.json")
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(summary, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"wrote {out} ({os.path.getsize(out) / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
