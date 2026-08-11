import type { ConsultVisualDocument } from "@/lib/types/consult-visual";
import type { DocOutline, DocSlideOutline } from "@/lib/types/docs";
import { slugifyFileName } from "@/lib/works-utils";

export function consultVisualToMarkdown(
  visual: ConsultVisualDocument,
  reply?: string,
): string {
  const lines: string[] = [`# ${visual.title}`, ""];

  if (visual.subtitle) {
    lines.push(`> ${visual.subtitle}`, "");
  }

  if (reply?.trim()) {
    lines.push("## 回答", "", reply.trim(), "");
  }

  if (visual.highlights.length) {
    lines.push("## ハイライト", "");
    for (const item of visual.highlights) {
      lines.push(`- **${item.label}**: ${item.value}${item.caption ? ` — ${item.caption}` : ""}`);
    }
    lines.push("");
  }

  if (visual.labels.length) {
    lines.push(`## 図解（${visual.layout}）`, "");
    visual.labels.forEach((label, i) => {
      lines.push(`${i + 1}. ${label}`);
    });
    lines.push("");
  }

  if (visual.cards.length) {
    lines.push("## ポイント", "");
    for (const card of visual.cards) {
      lines.push(`### ${card.title}`, "", card.body, "");
    }
  }

  if (visual.bullets.length) {
    lines.push("## 要点", "");
    for (const bullet of visual.bullets) {
      lines.push(`- ${bullet}`);
    }
    lines.push("");
  }

  return lines.join("\n").trim() + "\n";
}

export function consultVisualToOutline(visual: ConsultVisualDocument, reply?: string): DocOutline {
  const slides: DocSlideOutline[] = [
    {
      layout: "title",
      title: visual.title,
      subtitle: visual.subtitle,
      bullets: [],
    },
  ];

  const contentBullets = [
    ...(reply?.trim() ? [reply.trim().slice(0, 280)] : []),
    ...visual.bullets.slice(0, 4),
  ].slice(0, 5);

  const hasDiagramLabels = visual.labels.length >= 2;
  const diagramType =
    visual.layout === "cards" || visual.layout === "highlights"
      ? "icons"
      : visual.layout;

  if (hasDiagramLabels || contentBullets.length) {
    slides.push({
      layout: "content",
      title: visual.title,
      subtitle: visual.subtitle,
      bullets: contentBullets.length
        ? contentBullets
        : visual.cards.map((c) => `${c.title}: ${c.body}`).slice(0, 4),
      visual: hasDiagramLabels
        ? {
            type: diagramType,
            labels: visual.labels.slice(0, 5),
          }
        : undefined,
    });
  }

  if (visual.cards.length) {
    slides.push({
      layout: "content",
      title: "詳細ポイント",
      bullets: visual.cards.map((c) => `${c.title} — ${c.body}`).slice(0, 5),
      visual:
        visual.cards.length >= 2
          ? {
              type: "icons",
              labels: visual.cards.map((c) => c.title).slice(0, 5),
            }
          : undefined,
    });
  }

  slides.push({
    layout: "closing",
    title: "まとめ",
    bullets: visual.bullets.length
      ? visual.bullets.slice(0, 4)
      : visual.highlights.map((h) => `${h.label}: ${h.value}`).slice(0, 4),
    visual: hasDiagramLabels
      ? {
          type: diagramType,
          labels: visual.labels.slice(0, 5),
        }
      : undefined,
  });

  return {
    documentTitle: visual.title,
    subtitle: visual.subtitle,
    author: "AQUA WORKS",
    slides,
  };
}

export function consultExportFileName(title: string, ext: string): string {
  const base = slugifyFileName(title).replace(/\.md$/i, "");
  return `${base}.${ext}`;
}

export function downloadTextFile(content: string, fileName: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadBase64File(base64: string, fileName: string, mime: string): void {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
