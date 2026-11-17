import { Marked } from 'marked';

const esc = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const plain = (s) => s.replace(/<[^>]+>/g, '').replace(/&[a-z#0-9]+;/gi, ' ').trim();

/**
 * Markdown → article HTML.
 *  - ![alt](src "caption")   → <figure> with caption, click-to-zoom
 *  - ## Heading              → anchored, collected into a table of contents
 *  - ---                     → a small isometric cube divider
 *  - > quote                 → pull quote
 */
export function renderMarkdown(md) {
  const toc = [];
  const used = new Set();
  const marked = new Marked({ gfm: true, breaks: false });

  marked.use({
    renderer: {
      heading({ tokens, depth }) {
        const inner = this.parser.parseInline(tokens);
        let id = plain(inner).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section';
        while (used.has(id)) id += '-x';
        used.add(id);
        if (depth === 2) toc.push({ id, text: plain(inner) });
        return `<h${depth} id="${id}">${inner}</h${depth}>\n`;
      },
      image({ href, title, text }) {
        const cap = title ? `<figcaption>${esc(title)}</figcaption>` : '';
        return `<figure class="fig"><img src="${esc(href)}" alt="${esc(text)}" loading="lazy" decoding="async">${cap}</figure>`;
      },
      hr() {
        return '<div class="divider" aria-hidden="true"><i></i><i></i><i></i></div>\n';
      },
      link({ href, title, tokens }) {
        const inner = this.parser.parseInline(tokens);
        const ext = /^https?:\/\//.test(href);
        return `<a href="${esc(href)}"${title ? ` title="${esc(title)}"` : ''}${
          ext ? ' target="_blank" rel="noopener"' : ''
        }>${inner}</a>`;
      },
    },
  });

  let html = marked.parse(md || '');
  // A paragraph that only holds a figure shouldn't wrap it.
  html = html.replace(/<p>\s*(<figure[\s\S]*?<\/figure>)\s*<\/p>/g, '$1');
  return { html, toc };
}

export function readingMinutes(md = '') {
  const words = md.replace(/!\[[^\]]*\]\([^)]*\)/g, '').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 230));
}

export function excerptOf(md = '', n = 180) {
  const text = md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > n ? text.slice(0, n).replace(/\s\S*$/, '') + '…' : text;
}
