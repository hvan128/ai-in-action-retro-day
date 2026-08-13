import jsPDF from "jspdf";
import { TEMPLATES, type TemplateKey } from "./utils";
import { extractUrls } from "./linkify";

export interface ExportNote {
  content: string;
  color: string;
  column_key: string;
  votes: number;
  stickers: string[];
  author_name: string;
  like_count: number;
}

export interface ExportPayload {
  boardTitle: string;
  teamName: string;
  template: TemplateKey;
  notes: ExportNote[];
}

function download(filename: string, content: string | Blob, mime: string) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeName(s: string) {
  return s.replace(/[^a-z0-9-_]+/gi, "_").slice(0, 60);
}

function resolveColumns(p: ExportPayload) {
  const tmpl = TEMPLATES[p.template] ?? TEMPLATES["sprint_retrospective"];
  const known = new Set(tmpl.columns.map((c) => c.key));
  const extras = Array.from(new Set(p.notes.map((n) => n.column_key).filter((k) => k && !known.has(k))));
  const extraCols = extras.map((k) => ({ key: k, title: k, color: "slate", emoji: "📌", placeholder: "", prompts: [] }));
  return { tmpl, columns: [...tmpl.columns, ...extraCols] };
}

export function exportMarkdown(p: ExportPayload) {
  const { tmpl, columns } = resolveColumns(p);
  let md = `# ${p.boardTitle}\n\n**Team:** ${p.teamName}  \n**Template:** ${tmpl.name}  \n**Exported:** ${new Date().toLocaleString()}  \n**Total notes:** ${p.notes.length}\n\n`;
  for (const col of columns) {
    const items = p.notes.filter((n) => n.column_key === col.key);
    md += `\n## ${col.emoji} ${col.title} (${items.length})\n\n`;
    if (items.length === 0) {
      md += `_No notes_\n`;
      continue;
    }
    for (const n of items) {
      const stickers = n.stickers?.length ? ` ${n.stickers.join(" ")}` : "";
      const content = (n.content || "_(empty)_").replace(/\n/g, "\n  ");
      md += `- ${content}${stickers}\n  _— ${n.author_name} · ❤ ${n.like_count}_\n`;
    }
  }
  download(`${safeName(p.boardTitle)}.md`, md, "text/markdown");
}

export function exportCSV(p: ExportPayload) {
  const { columns } = resolveColumns(p);
  const colTitle = (k: string) => columns.find((c) => c.key === k)?.title ?? k;
  const escape = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [["Column", "Content", "Links", "Author", "Color", "Likes", "Stickers"]];
  for (const col of columns) {
    for (const n of p.notes.filter((x) => x.column_key === col.key)) {
      rows.push([
        colTitle(n.column_key),
        n.content,
        extractUrls(n.content || "").join(" | "),
        n.author_name,
        n.color,
        String(n.like_count),
        (n.stickers ?? []).join(" "),
      ]);
    }
  }
  const csv = rows.map((r) => r.map(escape).join(",")).join("\n");
  download(`${safeName(p.boardTitle)}.csv`, "\uFEFF" + csv, "text/csv;charset=utf-8");
}

export function exportPDF(p: ExportPayload) {
  const { tmpl, columns } = resolveColumns(p);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  let y = margin;

  const ensure = (h: number) => {
    if (y + h > pageH - margin) {
      doc.addPage();
      y = margin;
    }
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text(p.boardTitle, margin, y);
  y += 24;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text(`Team: ${p.teamName}  •  ${tmpl.name}  •  ${new Date().toLocaleString()}`, margin, y);
  y += 20;
  doc.setTextColor(0);

  for (const col of columns) {
    const items = p.notes.filter((n) => n.column_key === col.key);
    ensure(40);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(`${col.title}  (${items.length})`, margin, y);
    y += 16;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    if (items.length === 0) {
      doc.setTextColor(150);
      doc.text("No notes", margin + 12, y);
      doc.setTextColor(0);
      y += 16;
      continue;
    }

    for (const n of items) {
      const stickers = n.stickers?.length ? `  ${n.stickers.join(" ")}` : "";
      const text = (n.content || "(empty)") + stickers;
      const lines = doc.splitTextToSize(text, pageW - margin * 2 - 14) as string[];
      const meta = `— ${n.author_name}  •  ❤ ${n.like_count}`;
      const urls = extractUrls(n.content || "");
      const linkLines = urls.length ? urls.length : 0;
      const blockH = lines.length * 13 + 12 + 6 + linkLines * 12;
      ensure(blockH);
      doc.setDrawColor(220);
      doc.line(margin, y - 2, margin + 4, y - 2);
      doc.text(lines, margin + 12, y + 8);
      y += lines.length * 13 + 4;
      // Clickable links
      if (urls.length) {
        doc.setFontSize(9);
        doc.setTextColor(30, 100, 200);
        for (const url of urls) {
          doc.textWithLink(`🔗 ${url}`, margin + 12, y + 6, { url });
          y += 12;
        }
        doc.setTextColor(0);
        doc.setFontSize(10);
      }
      doc.setTextColor(130);
      doc.setFontSize(9);
      doc.text(meta, margin + 12, y + 6);
      doc.setFontSize(10);
      doc.setTextColor(0);
      y += 16;
    }
    y += 6;
  }

  doc.save(`${safeName(p.boardTitle)}.pdf`);
}
