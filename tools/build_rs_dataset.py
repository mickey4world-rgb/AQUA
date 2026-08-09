"""見える化サイト（rssystem.go.jp）の支出先 CSV から、既存と同じ fy*.json.gz を作る。

想定入力:
  data-src/rs/5-1_RS_2024_*/**.csv
  data-src/rs/5-1_RS_2025_*/**.csv

金額は円なので百万円に換算する。事業年度は CSV の「事業年度」列をそのまま使う。

    py tools/build_rs_dataset.py data-src/rs frontend/data/gyosei
"""

from __future__ import annotations

import csv
import gzip
import json
import re
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

EMPTY = {"", "-", "－", "ー", "‐", "該当なし", "なし"}
SUSPECT_YEN = 100_000_000_000  # 単一契約 1,000 億円超は単位異常の疑い


@dataclass
class Interner:
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
    src_root = Path(sys.argv[1] if len(sys.argv) > 1 else "data-src/rs")
    out_dir = Path(sys.argv[2] if len(sys.argv) > 2 else "frontend/data/gyosei")
    out_dir.mkdir(parents=True, exist_ok=True)

    files = [
        path
        for path in src_root.rglob("*.csv")
        if path.name.startswith("5-1_RS_") and "支出情報" in path.name
    ]
    # フォルダ名の文字化けに備えて、名前が 5-1_RS_YYYY で始まる CSV も拾う
    files += [
        path
        for path in src_root.rglob("*.csv")
        if re.match(r"5-1_RS_\d{4}", path.name)
    ]
    # dedupe
    seen: set[Path] = set()
    unique_files: list[Path] = []
    for path in files:
        resolved = path.resolve()
        if resolved in seen:
            continue
        seen.add(resolved)
        unique_files.append(path)
    unique_files.sort(key=lambda p: p.name)

    if not unique_files:
        raise SystemExit(f"{src_root} に 5-1_RS_* 支出情報 CSV がありません")

    for path in unique_files:
        year = detect_year(path)
        out = out_dir / f"fy{year}.json.gz"
        print(f"=== {path.name} -> {out.name} ===")
        build_year(path, year, out)


def detect_year(path: Path) -> int:
    match = re.search(r"RS_(\d{4})", path.name)
    if match:
        return int(match.group(1))
    with path.open(encoding="utf-8-sig", newline="") as fh:
        reader = csv.DictReader(fh)
        row = next(reader)
        return int(row["事業年度"])


def build_year(path: Path, year: int, out: Path) -> None:
    ministries = Interner()
    bureaus = Interner()
    payees = Interner()
    contracts = Interner()

    # key: (budget_id, ministry, project, bureau, block, payee, corp) -> aggregate
    # RS の 5-1 は「契約行（金額）＋支出先行（合計のみ）」が対になるため、
    # 契約金額があるキーでは合計行を無視して二重計上を避ける。
    aggregates: dict[tuple, dict] = {}
    fallbacks: dict[tuple, dict] = {}
    project_meta: dict[str, dict] = {}

    with path.open(encoding="utf-8-sig", newline="") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            payee = clean(row.get("支出先名", ""))
            if not payee:
                continue

            budget_id = clean(row.get("予算事業ID", "")) or "unknown"
            raw_ministry = clean(row.get("府省庁", "")) or clean(row.get("政策所管府省庁", "")) or "不明"
            ministry, agency = split_ministry(raw_ministry)
            project = clean(row.get("事業名", "")) or f"事業{budget_id}"
            bureau = clean(row.get("局・庁", "")) or agency or ministry
            block = clean(row.get("支出先ブロック番号", "")) or "A"
            corp = clean(row.get("法人番号", "")) or ""
            contract = clean(row.get("契約方式等", "")) or clean(row.get("具体的な契約方式等", "")) or ""
            work = clean(row.get("契約概要", "")) or clean(row.get("事業を行う上での役割", "")) or ""
            address = clean(row.get("所在地", "")) or ""
            key = (budget_id, ministry, project, bureau, block, payee, corp)

            amount_yen = to_number(row.get("金額", ""))
            if amount_yen is not None and amount_yen > 0:
                add_amount(aggregates, key, amount_yen, contract, work, address)
                continue

            total_yen = to_number(row.get("支出先の合計支出額", ""))
            if total_yen is not None and total_yen > 0:
                # 後で契約行が無いキーだけ採用（同キーは最大値を1回）
                prev = fallbacks.get(key)
                if prev is None or total_yen > prev["amount_yen"]:
                    fallbacks[key] = {
                        "amount_yen": total_yen,
                        "contract": contract,
                        "work": work,
                        "address": address,
                        "suspect": 1 if total_yen >= SUSPECT_YEN else 0,
                    }

    for key, bucket in fallbacks.items():
        if key not in aggregates:
            aggregates[key] = bucket

    for (budget_id, ministry, project, bureau, _block, _payee, _corp), bucket in aggregates.items():
        meta = project_meta.setdefault(
            budget_id,
            {
                "ministry": ministry,
                "name": project,
                "bureau": bureau,
                "amount_yen": 0.0,
                "suspect": 0,
            },
        )
        meta["amount_yen"] += bucket["amount_yen"]
        if bucket["suspect"]:
            meta["suspect"] = 1

    projects: list[list] = []
    project_index_by_id: dict[str, int] = {}
    for budget_id, meta in project_meta.items():
        project_index_by_id[budget_id] = len(projects)
        projects.append(
            [
                ministries.intern(meta["ministry"]),
                meta["name"],
                bureaus.intern(meta["bureau"]),
                round(meta["amount_yen"] / 1_000_000, 3),  # execution proxy
                0,
                budget_id,
                meta["suspect"],
            ]
        )

    flows: list[list] = []
    for (budget_id, _ministry, _project, _bureau, block, payee, corp), bucket in aggregates.items():
        project_index = project_index_by_id[budget_id]
        amount = round(bucket["amount_yen"] / 1_000_000, 3)
        if amount <= 0:
            continue
        work = bucket["work"]
        if bucket["address"] and bucket["address"] not in work:
            work = f"{work} / {bucket['address']}".strip(" /")
        flows.append(
            [
                project_index,
                payees.intern(payee),
                amount,
                block,
                contracts.intern(bucket["contract"]) if bucket["contract"] else -1,
                corp,
                work[:120],
            ]
        )

    # プロジェクトの suspect をフロー側にも反映
    for flow in flows:
        if projects[flow[0]][6]:
            continue

    payload = {
        "fiscalYear": year,
        "source": {
            "label": "行政事業レビュー見える化サイト（支出先・支出情報）",
            "publisher": "内閣官房 行政改革推進本部事務局",
            "license": "利用規約に従う（政府公開データ）",
            "url": "https://rssystem.go.jp/download-csv",
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
    with gzip.open(out, "wt", encoding="utf-8", compresslevel=9) as fh:
        fh.write(text)

    suspects = sum(1 for project in projects if project[6])
    print(f"projects: {len(projects):,} (suspect {suspects})")
    print(f"flows:    {len(flows):,}")
    print(f"payees:   {len(payees.values):,}")
    print(f"total:    {sum(project[3] for project in projects if not project[6]):,.0f} 百万円")


def split_ministry(raw: str) -> tuple[str, str]:
    """「国土交通省　気象庁」のように親府省＋外局が連結されている場合は親を府省庁にする。"""
    for sep in ("　", " ", "\u3000"):
        if sep in raw:
            left, right = raw.split(sep, 1)
            left, right = left.strip(), right.strip()
            if left and right:
                return left, right
    return raw, raw


def add_amount(
    aggregates: dict[tuple, dict],
    key: tuple,
    amount_yen: float,
    contract: str,
    work: str,
    address: str,
) -> None:
    bucket = aggregates.get(key)
    if bucket is None:
        aggregates[key] = {
            "amount_yen": amount_yen,
            "contract": contract,
            "work": work,
            "address": address,
            "suspect": 1 if amount_yen >= SUSPECT_YEN else 0,
        }
        return
    bucket["amount_yen"] += amount_yen
    if not bucket["contract"] and contract:
        bucket["contract"] = contract
    if not bucket["work"] and work:
        bucket["work"] = work
    if address and not bucket["address"]:
        bucket["address"] = address
    if amount_yen >= SUSPECT_YEN:
        bucket["suspect"] = 1


def clean(value: str | None) -> str:
    text = " ".join(str(value or "").split()).strip()
    return "" if text in EMPTY else text


def to_number(value: str | None) -> float | None:
    text = clean(value).replace(",", "").replace(" ", "")
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


if __name__ == "__main__":
    main()
