"""行政事業レビュー主要事項データベースの構造を確認する。

    py tools/probe_review.py data-src/R05.xlsx tools/probe-R05.txt
"""

import re
import sys
from collections import Counter

import openpyxl

PAYEE_RE = re.compile(r"^支出先上位..者リスト-([A-Z])\.支払先-(\d+)-(.+?)-(\d+)$")


def main() -> None:
    src, out = sys.argv[1], sys.argv[2]
    wb = openpyxl.load_workbook(src, read_only=True, data_only=True)
    lines: list[str] = []

    for ws in wb.worksheets:
        lines.append(f"=== sheet: {ws.title} ===")
        rows = ws.iter_rows(values_only=True)
        header = [norm(v) for v in next(rows)]
        lines.append(f"columns: {len(header)}")

        sample = [norm(v) for v in next(rows)]

        lines.append("\n--- columns 1..30 ---")
        for i in range(min(30, len(header))):
            lines.append(f"[{i + 1}] {header[i]}  |  {trunc(sample[i], 70)}")

        payee_idx = [i for i, h in enumerate(header) if PAYEE_RE.match(h)]
        other_payee = [i for i, h in enumerate(header) if "支出先" in h and not PAYEE_RE.match(h)]
        lines.append(f"\npayee columns: {len(payee_idx)} (range {payee_idx[0] + 1}..{payee_idx[-1] + 1})")
        lines.append(f"other 支出先 columns: {len(other_payee)}")
        for i in other_payee[:20]:
            lines.append(f"  [{i + 1}] {header[i]}")

        blocks: Counter[str] = Counter()
        fields: Counter[str] = Counter()
        seqs: Counter[str] = Counter()
        max_payee: Counter[str] = Counter()
        for i in payee_idx:
            m = PAYEE_RE.match(header[i])
            assert m
            blocks[m.group(1)] += 1
            fields[m.group(3)] += 1
            seqs[m.group(4)] += 1
            max_payee[m.group(1)] = max(max_payee[m.group(1)], int(m.group(2)))

        lines.append(f"\nblocks: {sorted(blocks)}")
        lines.append(f"max payee no per block: {dict(sorted(max_payee.items()))}")
        lines.append(f"seqs: {sorted(seqs)}")
        lines.append("fields:")
        for name, count in fields.most_common():
            lines.append(f"  {count:6d}  {name}")

        lines.append("\n--- neighbours of the payee block ---")
        for i in range(max(0, payee_idx[0] - 6), payee_idx[0] + 3):
            lines.append(f"[{i + 1}] {header[i]}")
        lines.append("  ...")
        for i in range(payee_idx[-1] - 2, min(len(header), payee_idx[-1] + 8)):
            lines.append(f"[{i + 1}] {header[i]}")

        lines.append("\n--- sample payee values (row 2, block A) ---")
        for i in payee_idx:
            m = PAYEE_RE.match(header[i])
            assert m
            if m.group(1) == "A" and int(m.group(2)) <= 3 and sample[i]:
                lines.append(f"[{i + 1}] {header[i]}\n      = {trunc(sample[i], 90)}")

        lines.append("\n--- budget / execution columns ---")
        for i, h in enumerate(header):
            if h.startswith("予算額・執行額") and ("執行額" in h.split("-")[-1] or "当初予算" in h):
                lines.append(f"[{i + 1}] {h}  |  {sample[i]}")

        break

    wb.close()
    with open(out, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))
    print(f"wrote {out}")


def norm(value: object) -> str:
    if value is None:
        return ""
    return " ".join(str(value).split())


def trunc(text: str, limit: int) -> str:
    return text if len(text) <= limit else text[:limit] + "…"


if __name__ == "__main__":
    main()
