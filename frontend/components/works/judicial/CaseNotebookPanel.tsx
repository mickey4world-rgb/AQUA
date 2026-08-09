"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import JudicialCompanion, {
  type JudicialMood,
} from "@/components/works/judicial/JudicialCompanion";
import { worksPanelClass } from "@/lib/works-utils";
import {
  JUDICIAL_AI_PROVIDER_LABELS,
  JUDICIAL_DOC_KIND_LABELS,
  type JudicialAiProvider,
  type JudicialCaseDocument,
  type JudicialChatMessage,
  type JudicialDocKind,
} from "@/lib/types/judicial-case";

const STARTERS = [
  "争点を整理してください。",
  "事実関係を時系列でまとめてください。",
  "甲号証と乙号証の対応関係を整理してください。",
  "判断材料メモとして、双方に有利・不利な事情を分けて書いてください。",
];

const KIND_OPTIONS = Object.entries(JUDICIAL_DOC_KIND_LABELS) as Array<
  [JudicialDocKind, string]
>;

const IDLE_LINES = [
  "記録を開いたら、一緒に整理しましょう。",
  "争点でも時系列でも、聞きたいことからどうぞ。",
  "選択した資料だけを根拠に答えます。",
];

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function buildExportText(
  messages: JudicialChatMessage[],
  model: string | null,
  provider: JudicialAiProvider,
  caseTitle: string | null,
  selectedTitles: string[],
): string {
  const lines = [
    "訴訟記録ノート — 会話エクスポート",
    `日時: ${new Date().toLocaleString("ja-JP")}`,
    `モデル: ${JUDICIAL_AI_PROVIDER_LABELS[provider]}${model ? ` (${model})` : ""}`,
    caseTitle ? `事件: ${caseTitle}` : null,
    selectedTitles.length > 0
      ? `根拠資料: ${selectedTitles.join(" / ")}`
      : null,
    "",
    "※ 法的助言ではありません。記録整理の学習用メモです。",
    "",
    "----------",
    "",
  ];

  for (const message of messages) {
    lines.push(message.role === "user" ? "[ユーザー]" : "[アシスタント]");
    lines.push(message.content);
    lines.push("");
  }

  return lines.filter((line) => line !== null).join("\n");
}

export default function CaseNotebookPanel() {
  const [documents, setDocuments] = useState<JudicialCaseDocument[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [messages, setMessages] = useState<JudicialChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingSamples, setLoadingSamples] = useState(false);
  const [uploadKind, setUploadKind] = useState<JudicialDocKind>("brief");
  const [provider, setProvider] = useState<JudicialAiProvider>("gemini");
  const [providersAvailable, setProvidersAvailable] = useState({
    gemini: true,
    openai: true,
  });
  const [pasteTitle, setPasteTitle] = useState("");
  const [pasteBody, setPasteBody] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<JudicialCaseDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [caseTitle, setCaseTitle] = useState<string | null>(null);
  const [idleTick, setIdleTick] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/works/judicial/case-chat");
        const data = await res.json();
        if (data.providers) {
          setProvidersAvailable({
            gemini: Boolean(data.providers.gemini),
            openai: Boolean(data.providers.openai),
          });
          if (!data.providers.gemini && data.providers.openai) {
            setProvider("openai");
          }
        }
      } catch {
        // ignore; UI still lets the user try
      }
    })();
  }, []);

  useEffect(() => {
    if (messages.length > 0 || sending) return;
    const id = window.setInterval(() => {
      setIdleTick((value) => value + 1);
    }, 5200);
    return () => window.clearInterval(id);
  }, [messages.length, sending]);

  const selectedDocs = useMemo(
    () => documents.filter((doc) => selectedIds.has(doc.id)),
    [documents, selectedIds],
  );

  const mood: JudicialMood = sending
    ? "thinking"
    : messages.some((message) => message.role === "assistant")
      ? "speaking"
      : "idle";

  const companionLine = useMemo(() => {
    if (sending) return "記録を読みながら整理しています…";
    if (messages.length === 0) return IDLE_LINES[idleTick % IDLE_LINES.length];
    const last = messages[messages.length - 1];
    if (last.role === "assistant") return "続きの観点も聞けます。";
    return "受け取りました。";
  }, [sending, messages, idleTick]);

  function addDocuments(next: JudicialCaseDocument[], selectAll = true) {
    setDocuments((prev) => {
      const withoutDup = prev.filter(
        (doc) => !next.some((item) => item.id === doc.id),
      );
      return [...withoutDup, ...next];
    });
    if (selectAll) {
      setSelectedIds((prev) => {
        const copy = new Set(prev);
        for (const doc of next) copy.add(doc.id);
        return copy;
      });
    }
  }

  async function loadSamples() {
    setLoadingSamples(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/works/judicial/case-chat?samples=1");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "サンプルの読み込みに失敗しました");
        return;
      }
      const docs = (data.documents ?? []) as JudicialCaseDocument[];
      addDocuments(docs, true);
      setCaseTitle(
        typeof data.case?.title === "string" ? data.case.title : "サンプル事件",
      );
      setNotice(
        typeof data.case?.summary === "string"
          ? data.case.summary
          : "サンプル事件をライブラリに追加しました。",
      );
    } catch {
      setError("サンプルの読み込みに失敗しました");
    } finally {
      setLoadingSamples(false);
    }
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setError(null);
    setNotice(null);

    const loaded: JudicialCaseDocument[] = [];
    for (const file of Array.from(fileList)) {
      const lower = file.name.toLowerCase();
      if (!lower.endsWith(".txt") && !lower.endsWith(".md")) {
        setError("対応形式は .txt / .md のみです（PDF は次フェーズ）。");
        continue;
      }
      const content = await file.text();
      if (!content.trim()) continue;
      loaded.push({
        id: newId("upload"),
        title: file.name.replace(/\.(txt|md)$/i, ""),
        kind: uploadKind,
        source: "upload",
        content,
      });
    }

    if (loaded.length > 0) {
      addDocuments(loaded, true);
      setNotice(`${loaded.length} 件の資料を追加しました。`);
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  function addPaste() {
    const title = pasteTitle.trim() || "貼り付け資料";
    const content = pasteBody.trim();
    if (!content) {
      setError("貼り付ける本文を入力してください。");
      return;
    }
    addDocuments(
      [
        {
          id: newId("paste"),
          title,
          kind: uploadKind,
          source: "upload",
          content,
        },
      ],
      true,
    );
    setPasteTitle("");
    setPasteBody("");
    setShowPaste(false);
    setNotice("貼り付け資料を追加しました。");
    setError(null);
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const copy = new Set(prev);
      if (copy.has(id)) copy.delete(id);
      else copy.add(id);
      return copy;
    });
  }

  function selectAll(on: boolean) {
    setSelectedIds(on ? new Set(documents.map((doc) => doc.id)) : new Set());
  }

  function removeDocument(id: string) {
    setDocuments((prev) => prev.filter((doc) => doc.id !== id));
    setSelectedIds((prev) => {
      const copy = new Set(prev);
      copy.delete(id);
      return copy;
    });
    setPreviewDoc((prev) => (prev?.id === id ? null : prev));
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    if (selectedDocs.length === 0) {
      setError("チャットに使う資料を1件以上選択してください。");
      return;
    }

    setError(null);
    setNotice(null);
    setSending(true);
    setInput("");

    const priorMessages = messages;
    const nextHistory: JudicialChatMessage[] = [
      ...priorMessages,
      { role: "user", content: trimmed },
    ];
    setMessages(nextHistory);

    try {
      const res = await fetch("/api/works/judicial/case-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          history: priorMessages,
          provider,
          documents: selectedDocs.map((doc) => ({
            id: doc.id,
            title: doc.title,
            kind: doc.kind,
            content: doc.content,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "送信に失敗しました");
        setMessages(priorMessages);
        return;
      }
      setModel(typeof data.model === "string" ? data.model : null);
      setMessages([
        ...nextHistory,
        { role: "assistant", content: data.reply as string },
      ]);
    } catch {
      setError("通信エラーが発生しました");
      setMessages(priorMessages);
    } finally {
      setSending(false);
    }
  }

  function resetChat() {
    setMessages([]);
    setError(null);
    setNotice(null);
    setInput("");
  }

  function exportTxt() {
    if (messages.length === 0) return;
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    downloadText(
      `case-notebook-${stamp}.txt`,
      buildExportText(
        messages,
        model,
        provider,
        caseTitle,
        selectedDocs.map((doc) => doc.title),
      ),
    );
    setNotice("会話を .txt でダウンロードしました。");
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <aside className={`${worksPanelClass} flex min-h-[28rem] flex-col p-4`}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[10px] font-medium tracking-[0.2em] text-violet-200/80 uppercase">
              Sources
            </p>
            <h2 className="mt-1 text-sm font-semibold text-white">資料ライブラリ</h2>
          </div>
          <span className="rounded-full border border-violet-300/25 bg-violet-400/10 px-2 py-0.5 text-[10px] text-violet-100">
            {selectedDocs.length}/{documents.length}
          </span>
        </div>

        {caseTitle && (
          <p className="mt-3 rounded-xl border border-violet-300/15 bg-violet-400/[0.06] px-3 py-2 text-[11px] leading-relaxed text-violet-100/90">
            {caseTitle}
          </p>
        )}

        {documents.length === 0 ? (
          <div className="mt-4 flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-white/12 bg-white/[0.02] px-4 py-8 text-center">
            <p className="text-sm text-slate-300">まだ資料がありません</p>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              架空の民事サンプルを読み込むか、.txt / .md を追加してください。
            </p>
            <button
              type="button"
              onClick={loadSamples}
              disabled={loadingSamples}
              className="mt-5 rounded-xl bg-gradient-to-r from-violet-300 to-fuchsia-200 px-4 py-2.5 text-xs font-semibold text-slate-950 disabled:opacity-50"
            >
              {loadingSamples ? "読み込み中…" : "サンプル事件を読み込む"}
            </button>
          </div>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => selectAll(true)}
                className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] text-slate-300 hover:bg-white/5"
              >
                全選択
              </button>
              <button
                type="button"
                onClick={() => selectAll(false)}
                className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] text-slate-300 hover:bg-white/5"
              >
                解除
              </button>
              <button
                type="button"
                onClick={loadSamples}
                disabled={loadingSamples}
                className="rounded-full border border-violet-300/20 px-2.5 py-1 text-[10px] text-violet-100 hover:bg-violet-400/10 disabled:opacity-50"
              >
                サンプル再読込
              </button>
            </div>

            <ul className="mt-3 max-h-[22rem] flex-1 space-y-2 overflow-y-auto pr-1">
              {documents.map((doc) => {
                const checked = selectedIds.has(doc.id);
                return (
                  <li
                    key={doc.id}
                    className={`rounded-xl border px-3 py-2.5 ${
                      checked
                        ? "border-violet-300/30 bg-violet-400/[0.08]"
                        : "border-white/8 bg-white/[0.02]"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleSelected(doc.id)}
                        className="mt-1"
                        aria-label={`${doc.title} を選択`}
                      />
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => setPreviewDoc(doc)}
                          className="block w-full truncate text-left text-xs font-medium text-white underline-offset-2 hover:text-violet-100 hover:underline"
                        >
                          {doc.title}
                        </button>
                        <span className="mt-1 flex flex-wrap gap-1.5">
                          <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-slate-400">
                            {JUDICIAL_DOC_KIND_LABELS[doc.kind]}
                          </span>
                          <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-slate-500">
                            {doc.source === "sample" ? "sample" : "upload"}
                          </span>
                        </span>
                        <div className="mt-2 flex gap-3">
                          <button
                            type="button"
                            onClick={() => setPreviewDoc(doc)}
                            className="text-[10px] text-violet-200/80 hover:text-violet-100"
                          >
                            開く
                          </button>
                          <button
                            type="button"
                            onClick={() => removeDocument(doc.id)}
                            className="text-[10px] text-slate-500 hover:text-rose-200"
                          >
                            削除
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        <div className="mt-4 space-y-2 border-t border-white/8 pt-4">
          <label className="block text-[10px] tracking-wide text-slate-500">
            追加時の種別
            <select
              value={uploadKind}
              onChange={(e) => setUploadKind(e.target.value as JudicialDocKind)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-slate-200"
            >
              {KIND_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <input
            ref={fileRef}
            type="file"
            accept=".txt,.md,text/plain,text/markdown"
            multiple
            className="hidden"
            onChange={(e) => void handleFiles(e.target.files)}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full rounded-xl border border-white/12 px-3 py-2 text-xs text-slate-200 hover:bg-white/5"
          >
            .txt / .md をアップロード
          </button>
          <button
            type="button"
            onClick={() => setShowPaste((value) => !value)}
            className="w-full rounded-xl border border-white/12 px-3 py-2 text-xs text-slate-200 hover:bg-white/5"
          >
            テキストを貼り付け
          </button>

          {showPaste && (
            <div className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-3">
              <input
                value={pasteTitle}
                onChange={(e) => setPasteTitle(e.target.value)}
                placeholder="資料名"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-xs text-white"
              />
              <textarea
                value={pasteBody}
                onChange={(e) => setPasteBody(e.target.value)}
                rows={5}
                placeholder="本文を貼り付け"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-xs text-white"
              />
              <button
                type="button"
                onClick={addPaste}
                className="w-full rounded-lg bg-violet-300/90 px-3 py-2 text-xs font-semibold text-slate-950"
              >
                ライブラリに追加
              </button>
            </div>
          )}
        </div>
      </aside>

      <section
        className={`${worksPanelClass} relative flex min-h-[34rem] flex-col overflow-hidden p-5`}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_15%_0%,rgba(196,181,253,0.14),transparent_45%),radial-gradient(ellipse_at_90%_20%,rgba(244,114,182,0.08),transparent_40%)]" />

        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <JudicialCompanion mood={mood} line={companionLine} />
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="inline-flex rounded-full border border-white/10 bg-black/20 p-0.5"
              role="group"
              aria-label="AI モデル"
            >
              {(["gemini", "openai"] as JudicialAiProvider[]).map((option) => {
                const available = providersAvailable[option];
                const active = provider === option;
                return (
                  <button
                    key={option}
                    type="button"
                    disabled={!available && option !== provider}
                    onClick={() => setProvider(option)}
                    className={`rounded-full px-3 py-1 text-[10px] font-medium transition ${
                      active
                        ? "bg-violet-300 text-slate-950"
                        : "text-slate-400 hover:text-slate-200 disabled:opacity-40"
                    }`}
                    title={
                      available
                        ? JUDICIAL_AI_PROVIDER_LABELS[option]
                        : `${JUDICIAL_AI_PROVIDER_LABELS[option]}（未設定）`
                    }
                  >
                    {JUDICIAL_AI_PROVIDER_LABELS[option]}
                  </button>
                );
              })}
            </div>
            {messages.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={exportTxt}
                  className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5"
                >
                  .txt 出力
                </button>
                <button
                  type="button"
                  onClick={resetChat}
                  className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-slate-400 hover:bg-white/5"
                >
                  新しい会話
                </button>
              </>
            )}
          </div>
        </div>

        <p className="relative mt-3 text-xs text-slate-400">
          選択中 {selectedDocs.length} 件
          {model ? ` · ${JUDICIAL_AI_PROVIDER_LABELS[provider]} / ${model}` : ""}
        </p>

        <div className="relative mt-4 flex flex-wrap gap-2">
          {STARTERS.map((starter) => (
            <button
              key={starter}
              type="button"
              disabled={sending || selectedDocs.length === 0}
              onClick={() => void sendMessage(starter)}
              className="rounded-full border border-violet-300/20 bg-violet-400/[0.06] px-3 py-1.5 text-[11px] text-violet-100 hover:bg-violet-400/12 disabled:opacity-40"
            >
              {starter.replace("ください。", "")}
            </button>
          ))}
        </div>

        <div className="relative mt-5 max-h-[26rem] flex-1 space-y-3 overflow-y-auto pr-1">
          {messages.length === 0 && (
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-5">
              <p className="text-sm leading-relaxed text-slate-300">
                左のライブラリで資料を選び、争点整理や時系列などから聞いてみてください。回答は選択した資料だけを根拠にします。資料名をクリックすると本文を開けます。
              </p>
            </div>
          )}

          {messages.map((message, index) => (
            <div
              key={`${index}-${message.role}`}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[94%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  message.role === "user"
                    ? "bg-gradient-to-r from-violet-500/80 to-fuchsia-500/70 text-white"
                    : "border border-violet-300/15 bg-violet-400/[0.06] text-slate-100"
                }`}
              >
                {message.content}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {error && (
          <p className="relative mt-3 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
            {error}
          </p>
        )}
        {notice && (
          <p className="relative mt-3 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
            {notice}
          </p>
        )}

        <form
          className="relative mt-4 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            void sendMessage(input);
          }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                void sendMessage(input);
              }
            }}
            rows={2}
            maxLength={2000}
            disabled={sending}
            placeholder="質問を書く（Enter で送信）"
            className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/5 px-3.5 py-3 text-sm text-white placeholder:text-slate-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={sending || !input.trim() || selectedDocs.length === 0}
            className="rounded-xl bg-gradient-to-r from-violet-300 to-fuchsia-200 px-5 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50 sm:self-end"
          >
            {sending ? "整理中…" : "送信"}
          </button>
        </form>

        <p className="relative mt-3 text-[10px] leading-relaxed text-slate-500">
          法的助言ではありません。記録の整理・争点抽出・判断材料の整理に限定した学習用ツールです。アップロード本文はサーバに永続化しません（送信時のみ選択資料を
          API に載せます）。サンプルは完全に架空の事件です。OpenAI
          選択時は Azure OpenAI 経由で、月次トークン上限が適用されます。
        </p>
      </section>

      {previewDoc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="judicial-doc-preview-title"
          onClick={() => setPreviewDoc(null)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/12 bg-slate-950 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
              <div className="min-w-0">
                <p className="text-[10px] tracking-[0.18em] text-violet-200/70 uppercase">
                  {JUDICIAL_DOC_KIND_LABELS[previewDoc.kind]}
                </p>
                <h3
                  id="judicial-doc-preview-title"
                  className="mt-1 truncate text-sm font-semibold text-white"
                >
                  {previewDoc.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPreviewDoc(null)}
                className="rounded-full border border-white/12 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5"
              >
                閉じる
              </button>
            </div>
            <pre className="flex-1 overflow-y-auto whitespace-pre-wrap px-5 py-4 font-sans text-xs leading-relaxed text-slate-200">
              {previewDoc.content}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
