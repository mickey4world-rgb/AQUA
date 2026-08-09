import { readFileSync } from "node:fs";
import path from "node:path";
import type { JudicialCaseDocument, JudicialDocKind } from "@/lib/types/judicial-case";

type SampleMeta = {
  file: string;
  id: string;
  title: string;
  kind: JudicialDocKind;
};

const SAMPLE_META: SampleMeta[] = [
  {
    file: "01-complaint.md",
    id: "sample-complaint",
    title: "訴状（建物明渡等請求）",
    kind: "complaint",
  },
  {
    file: "02-answer.md",
    id: "sample-answer",
    title: "答弁書",
    kind: "answer",
  },
  {
    file: "03-brief-plaintiff.md",
    id: "sample-brief",
    title: "原告第1準備書面",
    kind: "brief",
  },
  {
    file: "04-exhibit-ko1.md",
    id: "sample-ko1",
    title: "甲第1号証（賃貸借契約書抜粋）",
    kind: "plaintiff_exhibit",
  },
  {
    file: "05-exhibit-ko2.md",
    id: "sample-ko2",
    title: "甲第2号証（催告書）",
    kind: "plaintiff_exhibit",
  },
  {
    file: "06-exhibit-otsu1.md",
    id: "sample-otsu1",
    title: "乙第1号証（漏水状況説明）",
    kind: "defendant_exhibit",
  },
  {
    file: "07-exhibit-list.md",
    id: "sample-exhibit-list",
    title: "証拠説明書",
    kind: "exhibit_list",
  },
  {
    file: "08-statement.md",
    id: "sample-statement",
    title: "陳述書（被告）",
    kind: "statement",
  },
];

const SAMPLE_DIR = path.join(process.cwd(), "data", "judicial", "samples");

export const JUDICIAL_SAMPLE_CASE = {
  id: "rental-eviction-demo",
  title: "架空事件：建物明渡・未払賃料",
  summary:
    "賃貸人が賃借人に建物明渡と未払賃料を請求。賃借人は漏水修繕義務不履行と損害の相殺を主張する、完全に架空のサンプル事件です。",
};

export function loadJudicialSampleDocuments(): JudicialCaseDocument[] {
  return SAMPLE_META.map((meta) => ({
    id: meta.id,
    title: meta.title,
    kind: meta.kind,
    source: "sample" as const,
    content: readFileSync(path.join(SAMPLE_DIR, meta.file), "utf8"),
  }));
}
