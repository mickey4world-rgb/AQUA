export type JudicialDocKind =
  | "complaint"
  | "answer"
  | "brief"
  | "plaintiff_exhibit"
  | "defendant_exhibit"
  | "exhibit_list"
  | "statement";

export const JUDICIAL_DOC_KIND_LABELS: Record<JudicialDocKind, string> = {
  complaint: "訴状",
  answer: "答弁書",
  brief: "準備書面",
  plaintiff_exhibit: "甲号証",
  defendant_exhibit: "乙号証",
  exhibit_list: "証拠説明書",
  statement: "陳述書",
};

export type JudicialAiProvider = "gemini" | "openai";

export const JUDICIAL_AI_PROVIDER_LABELS: Record<JudicialAiProvider, string> = {
  gemini: "Gemini",
  openai: "OpenAI",
};

export type JudicialCaseDocument = {
  id: string;
  title: string;
  kind: JudicialDocKind;
  content: string;
  source: "sample" | "upload";
};

export type JudicialChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type JudicialCaseChatRequest = {
  message: string;
  history: JudicialChatMessage[];
  documents: Array<{
    id: string;
    title: string;
    kind: JudicialDocKind;
    content: string;
  }>;
  provider?: JudicialAiProvider;
};
