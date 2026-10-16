import { useMemo } from 'react';
import styles from './LessonRenderer.module.css';

interface LessonRendererProps {
  markdown: string;
}

/**
 * Renders a lesson Markdown string as HTML.
 * Supports: headings, paragraphs, code blocks, inline code, bold, italic,
 * links, lists, blockquotes (including callout boxes), and horizontal rules.
 *
 * Uses a lightweight custom parser — no external Markdown library needed.
 * This keeps the bundle small and avoids the overhead of remark/rehype.
 */
export default function LessonRenderer({ markdown }: LessonRendererProps) {
  const html = useMemo(() => renderMarkdown(markdown), [markdown]);

  return (
    <div
      className={styles.lesson}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// ─── Markdown renderer ───────────────────────────────────────────────────────

function renderMarkdown(md: string): string {
  // Strip frontmatter (YAML between --- delimiters)
  const withoutFrontmatter = md.replace(/^---[\s\S]*?---\n*/, '');

  const lines = withoutFrontmatter.split('\n');
  const out: string[] = [];
  let i = 0;
  let inList = false;
  let listType: 'ul' | 'ol' = 'ul';

  while (i < lines.length) {
    const line = lines[i]!;

    // Fenced code block
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.startsWith('```')) {
        codeLines.push(lines[i]!);
        i++;
      }
      i++; // skip closing ```
      const source = codeLines.join('\n');
      if (lang.toLowerCase() === 'mermaid') {
        out.push(renderFlowchart(source));
        continue;
      }
      const code = escapeHtml(source);
      const langAttr = lang ? ` data-lang="${escapeHtml(lang)}"` : '';
      const langLabel = lang ? `<span class="${styles.codeLang}">${escapeHtml(lang)}</span>` : '';
      out.push(`<div class="${styles.codeBlock}"${langAttr}>${langLabel}<pre><code>${code}</code></pre></div>`);
      continue;
    }

    // Close open list if line is not a list item
    if (inList && !/^\s*[-*+]\s/.test(line) && !/^\s*\d+\.\s/.test(line) && line.trim() !== '') {
      out.push(`</${listType}>`);
      inList = false;
    }

    // Blank line
    if (line.trim() === '') {
      if (inList) {
        out.push(`</${listType}>`);
        inList = false;
      }
      i++;
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1]!.length;
      const text = processInline(headingMatch[2]!);
      out.push(`<h${level}>${text}</h${level}>`);
      i++;
      continue;
    }

    // Blockquote / callout
    if (line.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && (lines[i]!.startsWith('>') || lines[i]!.trim() === '')) {
        if (lines[i]!.startsWith('>')) {
          quoteLines.push(lines[i]!.replace(/^>\s?/, ''));
        } else if (quoteLines.length > 0) {
          break;
        }
        i++;
      }
      const content = processInline(quoteLines.join('\n'));

      // Check for callout types: [!NOTE], [!TIP], [!WARNING], etc.
      const calloutMatch = content.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\n?([\s\S]*)/);
      if (calloutMatch) {
        const type = calloutMatch[1]!.toLowerCase();
        const text = calloutMatch[2]!;
        out.push(`<div class="${styles.callout} ${styles[`callout_${type}`] ?? ''}" role="note"><strong>${calloutMatch[1]}</strong><p>${text}</p></div>`);
      } else {
        out.push(`<blockquote>${content}</blockquote>`);
      }
      continue;
    }

    // Horizontal rule
    if (/^[-*_]{3,}$/.test(line.trim())) {
      out.push('<hr />');
      i++;
      continue;
    }

    // Unordered list
    if (/^\s*[-*+]\s/.test(line)) {
      if (!inList) {
        listType = 'ul';
        out.push('<ul>');
        inList = true;
      }
      out.push(`<li>${processInline(line.replace(/^\s*[-*+]\s+/, ''))}</li>`);
      i++;
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s/.test(line)) {
      if (!inList) {
        listType = 'ol';
        out.push('<ol>');
        inList = true;
      }
      out.push(`<li>${processInline(line.replace(/^\s*\d+\.\s+/, ''))}</li>`);
      i++;
      continue;
    }

    // Paragraph (collect consecutive non-empty lines)
    const paraLines: string[] = [];
    while (i < lines.length && lines[i]!.trim() !== '' && !lines[i]!.startsWith('#') && !lines[i]!.startsWith('```') && !lines[i]!.startsWith('>') && !/^[-*_]{3,}$/.test(lines[i]!.trim())) {
      paraLines.push(lines[i]!);
      i++;
    }
    if (paraLines.length > 0) {
      out.push(`<p>${processInline(paraLines.join(' '))}</p>`);
    } else {
      i++;
    }
  }

  if (inList) {
    out.push(`</${listType}>`);
  }

  return out.join('\n');
}

function processInline(text: string): string {
  let result = escapeHtml(text);

  // Bold: **text** or __text__
  result = result.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  result = result.replace(/__(.+?)__/g, '<strong>$1</strong>');

  // Italic: *text* or _text_
  result = result.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');

  // Inline code: `code`
  result = result.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Links: [text](url)
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, href: string) => {
    return `<a href="${escapeHtml(safeHref(href))}" target="_blank" rel="noopener">${label}</a>`;
  });

  // Line breaks within blockquotes
  result = result.replace(/\n/g, '<br />');

  return result;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeHref(raw: string): string {
  try {
    const url = new URL(raw, window.location.origin);
    if (['http:', 'https:', 'mailto:'].includes(url.protocol)) return raw;
  } catch { /* Invalid URLs render as inert links. */ }
  return '#';
}

function renderFlowchart(source: string): string {
  const lines = source.split('\n').map((line) => line.trim()).filter((line) => line && !/^(flowchart|graph)\s/.test(line));
  const nodes = new Map<string, string>();
  const edges: Array<[string, string]> = [];
  for (const line of lines) {
    const match = line.match(/^([\w-]+)(?:\[(.*?)\])?\s*-->\s*([\w-]+)(?:\[(.*?)\])?$/);
    if (!match) continue;
    const [, from, fromLabel, to, toLabel] = match;
    if (!from || !to) continue;
    nodes.set(from, fromLabel ?? from);
    nodes.set(to, toLabel ?? to);
    edges.push([from, to]);
  }
  if (nodes.size === 0) return `<pre class="${styles.diagramFallback}"><code>${escapeHtml(source)}</code></pre>`;
  const ids = [...nodes.keys()];
  const width = Math.max(420, ids.length * 170);
  const positions = new Map(ids.map((id, index) => [id, { x: 30 + index * (width - 150) / Math.max(ids.length - 1, 1), y: 45 }]));
  const arrows = edges.map(([from, to]) => {
    const a = positions.get(from)!; const b = positions.get(to)!;
    return `<path d="M ${a.x + 130} ${a.y + 28} L ${b.x} ${b.y + 28}" marker-end="url(#fde-arrow)" />`;
  }).join('');
  const boxes = ids.map((id) => {
    const point = positions.get(id)!;
    return `<g><rect x="${point.x}" y="${point.y}" width="130" height="56" rx="8"/><text x="${point.x + 65}" y="${point.y + 34}">${escapeHtml(nodes.get(id)!)}</text></g>`;
  }).join('');
  return `<div class="${styles.diagram}" role="img" aria-label="Flowchart"><svg viewBox="0 0 ${width} 150" xmlns="http://www.w3.org/2000/svg"><defs><marker id="fde-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z"/></marker></defs>${arrows}${boxes}</svg></div>`;
}
