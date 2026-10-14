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
      const code = escapeHtml(codeLines.join('\n'));
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
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

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
