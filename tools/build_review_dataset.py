"""行政事業レビュー「主要事項データベース」XLSX から、お金の流れ用のスリムなデータセットを作る。

元の XLSX は 1 事業 1 行・14,000 列超という横長構造で、支出先は
「支出先上位１０者リスト-{ブロック}.支払先-{n}-{項目}」という列群に展開されている。
これを (事業, 支出先, 金額) の縦持ちに変換し、文字列を辞書化して JSON に落とす。

    py tools/build_review_dataset.py data-src/R05.xlsx frontend/data/gyosei/fy2022.json

出典: 内閣官房行政改革推進本部事務局「行政事業レビューシートの主要事項のデータベース」(CC BY)
"""

from __future__ import annotations

import gzip
import json
import re
import sys
from dataclasses import dataclass, field

import openpyxl

PAYEE_RE = re.compile(r"^支出先上位..者リスト-([A-Z])\.支払先-(\d+)-(.+?)(?:-\d+)?$")
EXEC_RE = re.compile(r"^予算額・執行額（単位:百万円）-(.+?)-執行額$")
BUDGET_RE = re.compile(r"^予算額・執行額（単位:百万円）-(.+?)-予算の状況-当初予算$")
ERA_BASE = {"令和": 2018, "平成": 1988}
CONTRACT_FIELDS = ("契約方式等", "契約方式")

WORK_SUMMARY_LIMIT = 120
EMPTY_MARKERS = {"", "-", "－", "ー", "‐", "該当なし", "なし"}

# 一部の事業は支出額を百万円ではなく円で入力しており、そのままだと 1 事業で数十兆円になる。
# 執行額と桁が合わない事業に印を付け、集計から外せるようにする。
SUSPECT_RATIO = 100


@dataclass
class Interner:
    """同じ文字列が何度も出てくるので辞書化して JSON を小さくする。"""

    values: list[str] = field(default_factory=list)
    index: dict[str, int] = field(default_factory=dict)

    def intern(self, text: str) -> int:
        found = self.index.get(text)
        if found is None:
            found = len(self.values)
            self.index[text] = found
            self.values.append(text)
        return found


def main() -> None:
    if len(sys.argv) < 3:
        print("usage: py tools/build_review_dataset.py <xlsx> <out.json>")
        raise SystemExit(1)

    src, out = sys.argv[1], sys.argv[2]
    wb = openpyxl.load_workbook(src, read_only=True, data_only=True)
    ws = wb.worksheets[0]
    rows = ws.iter_rows(values_only=True)
    header = [norm(v) for v in next(rows)]

    columns = locate_columns(header)
    fiscal_year = columns["fiscal_year"]
    print(f"payee fiscal year: {fiscal_year}")
    print(f"payee groups: {len(columns['payees'])}")

    ministries = Interner()
    bureaus = Interner()
    payees = Interner()
    contracts = Interner()

    projects: list[list] = []
    flows: list[list] = []

    for row in rows:
        cells = [norm(v) for v in row]
        if len(cells) < len(header):
            cells.extend([""] * (len(header) - len(cells)))

        ministry = cells[columns["ministry"]]
        project_name = cells[columns["project_name"]]
        if not ministry or not project_name:
            continue

        project_flows: list[list] = []
        for group in columns["payees"]:
            payee_name = cells[group["payee"]]
            if clean(payee_name) is None:
                continue
            amount = to_number(cells[group["amount"]])
            if amount is None or amount <= 0:
                continue

            work = clean(cells[group["work"]]) or ""
            contract = clean(cells[group["contract"]]) or ""
            corp = clean(cells[group["corp"]]) or ""

            project_flows.append(
                [
                    payees.intern(payee_name),
                    round(amount, 3),
                    group["block"],
                    contracts.intern(contract) if contract else -1,
                    corp,
                    work[:WORK_SUMMARY_LIMIT],
                ]
            )

        if not project_flows:
            continue

        execution = to_number(cells[columns["execution"]]) or 0
        flow_total = sum(flow[1] for flow in project_flows)
        suspect = 1 if execution > 0 and flow_total > execution * SUSPECT_RATIO else 0

        project_index = len(projects)
        projects.append(
            [
                ministries.intern(ministry),
                project_name,
                bureaus.intern(cells[columns["bureau"]]),
                execution,
                to_number(cells[columns["budget"]]) or 0,
                project_number(cells, columns["project_no"]),
                suspect,
            ]
        )
        for flow in project_flows:
            flows.append([project_index, *flow])

    wb.close()

    payload = {
        "fiscalYear": fiscal_year,
        "source": {
            "label": "行政事業レビューシートの主要事項のデータベース",
            "publisher": "内閣官房 行政改革推進本部事務局",
            "license": "CC BY 4.0",
            "url": "https://www.gyoukaku.go.jp/review/database/index.html",
        },
        "unit": "百万円",
        "dictionaries": {
            "ministries": ministries.values,
            "bureaus": bureaus.values,
            "payees": payees.values,
            "contracts": contracts.values,
        },
        "projectFields": ["ministry", "name", "bureau", "execution", "budget", "number", "suspect"],
        "flowFields": ["project", "payee", "amount", "block", "contract", "corpNumber", "work"],
        "projects": projects,
        "flows": flows,
    }

    text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    if out.endswith(".gz"):
        # 4 年度分をリポジトリに同梱するので圧縮して置き、サーバー側で展開する。
        with gzip.open(out, "wt", encoding="utf-8", compresslevel=9) as fh:
            fh.write(text)
    else:
        with open(out, "w", encoding="utf-8") as fh:
            fh.write(text)

    suspects = sum(1 for p in projects if p[6])
    print(f"projects: {len(projects):,} (単位が疑わしい事業 {suspects})")
    print(f"flows:    {len(flows):,}")
    print(f"payees:   {len(payees.values):,}")
    print(f"wrote {out}")


def locate_columns(header: list[str]) -> dict:
    exact = {}
    for i, name in enumerate(header):
        if name not in exact:
            exact[name] = i

    exec_years: dict[int, int] = {}
    budget_years: dict[int, int] = {}
    # 年度ラベルは西暦（2022年度）と和暦（平成29年度 / 30年度 / 令和元年度 / 2年度）が混在し、
    # 和暦は元号が省略されることがあるので列順に読みながら直前の元号を引き継ぐ。
    era = ""
    for i, name in enumerate(header):
        for pattern, sink in ((EXEC_RE, exec_years), (BUDGET_RE, budget_years)):
            m = pattern.match(name)
            if not m:
                continue
            year, era = parse_fiscal_label(m.group(1), era)
            if year is not None and year not in sink:
                sink[year] = i

    if not exec_years:
        raise SystemExit("執行額の列が見つかりません")
    # レビューシートは前年度の執行実績と支出先を載せるので、執行額のある最新年度が支出年度。
    fiscal_year = max(exec_years)

    groups = []
    seen = set()
    for i, name in enumerate(header):
        m = PAYEE_RE.match(name)
        if not m or m.group(3) != "支出先":
            continue
        block, no = m.group(1), m.group(2)
        if (block, no) in seen:
            continue
        seen.add((block, no))

        def sibling(*field_names: str) -> int:
            for field_name in field_names:
                for suffix in ("-01", ""):
                    key = f"支出先上位１０者リスト-{block}.支払先-{no}-{field_name}{suffix}"
                    if key in exact:
                        return exact[key]
            return -1

        groups.append(
            {
                "block": block,
                "payee": i,
                "corp": sibling("法人番号"),
                "work": sibling("業務概要"),
                "amount": sibling("支出額（百万円）"),
                "contract": sibling(*CONTRACT_FIELDS),
            }
        )

    groups = [g for g in groups if g["amount"] >= 0]

    return {
        "fiscal_year": fiscal_year,
        "ministry": exact["府省庁"],
        "project_name": exact["事業名"],
        "bureau": exact.get("担当部局庁", exact["府省庁"]),
        "execution": exec_years[fiscal_year],
        "budget": budget_years.get(fiscal_year, exec_years[fiscal_year]),
        "project_no": [exact[f"事業番号-{n}"] for n in range(1, 6) if f"事業番号-{n}" in exact],
        "payees": groups,
    }


def parse_fiscal_label(label: str, era: str) -> tuple[int | None, str]:
    """「2022年度」「平成29年度」「30年度」「令和元年度」を西暦に直す。

    元号が省略された「30年度」は直前に現れた元号を引き継ぐ。「3年度要求」のような
    要求年度は執行実績が無いので None を返して無視する。
    """
    if "要求" in label:
        return None, era

    m = re.match(r"^(令和|平成)?(元|\d+)年度$", label)
    if not m:
        return None, era

    if m.group(1):
        era = m.group(1)
    number = 1 if m.group(2) == "元" else int(m.group(2))

    if number >= 1000:  # 西暦表記
        return number, era
    if not era:
        return None, era
    return ERA_BASE[era] + number, era


def project_number(cells: list[str], indexes: list[int]) -> str:
    parts = [cells[i] for i in indexes if i < len(cells) and clean(cells[i])]
    return "-".join(parts)


def norm(value: object) -> str:
    if value is None:
        return ""
    return " ".join(str(value).split())


def clean(text: str) -> str | None:
    stripped = text.strip()
    return None if stripped in EMPTY_MARKERS else stripped


def to_number(text: str) -> float | None:
    stripped = text.replace(",", "").replace("　", "").strip()
    if stripped in EMPTY_MARKERS:
        return None
    try:
        return float(stripped)
    except ValueError:
        return None


if __name__ == "__main__":
    main()
