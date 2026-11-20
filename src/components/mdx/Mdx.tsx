import { useMemo } from 'react';
import MarkdownIt from 'markdown-it';

import { docLinkTarget, headingId, safeDocHref } from '@/modules/docs/paths';

import '@/styles/mdx.css';

/**
 * Documentation body renderer.
 *
 * The repository already ships `markdown-it` (used for database-backed blog
 * posts), so the docs use the same renderer instead of a second markdown
 * implementation. Raw HTML is disabled and markdown-it rejects unsafe link
 * protocols, so the generated markup is safe to inject.
 */
const md = new MarkdownIt({
  html: false,
  linkify: true,
});

/**
 * Headings get a stable id so the table of contents can link to them.
 *
 * The id must come from the same {@link headingId} the table of contents
 * uses, otherwise the anchors do not match.
 */
md.renderer.rules.heading_open = (tokens, idx) => {
  const token = tokens[idx];
  const inline = tokens[idx + 1];
  const text = inline?.type === 'inline' ? inline.content : '';
  const id = headingId(text);
  return `<${token.tag}${id ? ` id="${id}"` : ''}>`;
};

/**
 * Links: relative document links become documentation routes, external links
 * open in a new tab.
 *
 * Every other link target is validated with {@link safeDocHref}: a target
 * whose scheme is not allowed loses its `href`, so the text stays readable
 * but the link is not clickable.
 */
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const href = token.attrGet('href') ?? '';

  const target = docLinkTarget(href);
  if (target) {
    token.attrSet(
      'href',
      `/docs/${target.slug}${target.hash ? `#${target.hash}` : ''}`
    );
    return self.renderToken(tokens, idx, options);
  }

  const safe = safeDocHref(href);
  if (safe === undefined) {
    // Unsafe scheme: keep the text, drop the link.
    const index = token.attrIndex('href');
    if (index >= 0) token.attrs?.splice(index, 1);
    return self.renderToken(tokens, idx, options);
  }

  token.attrSet('href', safe);
  if (/^https?:\/\//i.test(safe)) {
    token.attrSet('target', '_blank');
    token.attrSet('rel', 'noopener noreferrer');
  }

  return self.renderToken(tokens, idx, options);
};

/**
 * Render a markdown body.
 *
 * The document title comes from the frontmatter and is rendered by the page,
 * so a leading `# heading` in the body is dropped to avoid two `<h1>`s.
 */
export function Mdx({ source }: { source: string }) {
  const html = useMemo(() => md.render(stripLeadingTitle(source)), [source]);

  return <div className="mdx" dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Drop the leading `# heading` of a body. */
function stripLeadingTitle(markdown: string): string {
  return markdown.replace(/^\s*#[ \t]+[^\n]*\n+/, '');
}
