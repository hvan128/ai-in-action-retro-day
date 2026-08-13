import React from "react";

// Match http(s)://... and bare www.... URLs
const URL_REGEX = /\b((?:https?:\/\/|www\.)[^\s<>"']+[^\s<>"'.,;:!?)\]}])/gi;

export function extractUrls(text: string): string[] {
  if (!text) return [];
  const out: string[] = [];
  const re = new RegExp(URL_REGEX.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.push(normalizeUrl(m[1]));
  return out;
}

export function normalizeUrl(u: string): string {
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}

/** Render text with auto-detected URLs as clickable links (open in new tab). */
export function Linkify({ text, className }: { text: string; className?: string }) {
  if (!text) return null;
  const parts: React.ReactNode[] = [];
  const re = new RegExp(URL_REGEX.source, "gi");
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    const start = m.index;
    if (start > last) parts.push(text.slice(last, start));
    const raw = m[1];
    parts.push(
      <a
        key={key++}
        href={normalizeUrl(raw)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onDoubleClick={(e) => e.stopPropagation()}
        className="text-sky-700 underline decoration-sky-400/60 underline-offset-2 hover:text-sky-900 hover:decoration-sky-600 break-all"
      >
        {raw}
      </a>,
    );
    last = start + raw.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <span className={className}>{parts}</span>;
}
