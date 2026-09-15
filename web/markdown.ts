// Safe markdown rendering for chat messages.
// Raw HTML from cards/models is escaped, and links are limited to http(s)/mailto.
import { Marked, type Tokens } from 'marked';

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const safeUrl = (href: string) => (/^(https?:|mailto:)/i.test(href.trim()) ? escapeHtml(href) : null);

const md = new Marked({ gfm: true, breaks: true });

md.use({
  renderer: {
    html({ text }: Tokens.HTML | Tokens.Tag) {
      return escapeHtml(text);
    },
    link({ href, tokens }: Tokens.Link) {
      const inner = this.parser.parseInline(tokens);
      const url = safeUrl(href);
      return url ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${inner}</a>` : inner;
    },
    image({ href, text }: Tokens.Image) {
      const url = safeUrl(href);
      return url ? `<img src="${url}" alt="${escapeHtml(text)}" loading="lazy">` : escapeHtml(text);
    },
  },
  // Highlight "spoken dialogue" the way RP frontends usually do.
  extensions: [
    {
      name: 'rpQuote',
      level: 'inline',
      start(src: string) {
        return src.match(/["“]/)?.index;
      },
      tokenizer(src: string) {
        const m = /^(?:"([^"\n]+)"|“([^”\n]+)”)/.exec(src);
        if (!m) return undefined;
        const inner = m[1] ?? m[2];
        return { type: 'rpQuote', raw: m[0], open: m[0][0], close: m[0].at(-1), tokens: this.lexer.inlineTokens(inner) };
      },
      renderer(token) {
        const t = token as Tokens.Generic;
        return `<span class="rp-quote">${escapeHtml(t.open)}${this.parser.parseInline(t.tokens ?? [])}${escapeHtml(t.close)}</span>`;
      },
    },
  ],
});

export function renderMarkdown(text: string): string {
  return md.parse(text, { async: false }) as string;
}
