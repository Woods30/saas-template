/**
 * Docs module — pure logic.
 *
 * Everything in this file is framework-free so it can be unit-tested with
 * `node --import tsx --test`. The glob-backed loader lives in `./service.ts`
 * (`import.meta.glob` does not exist under plain node), routes import that
 * one, tests import this one.
 *
 * Content lives in `content/docs/*.md`. File naming:
 *
 *   guide.md        → base-locale document, slug `guide`
 *   guide.zh.md     → translation, slug `guide` (same page, other language)
 *   guide.v2.md     → dotted name that is not a locale tag, slug `guide.v2`
 *
 * The locale tag is the dot-segment right before `.md` when it looks like a
 * language tag (`^[a-z]{2,3}(-[A-Za-z0-9]+)?$`). Because of that rule a file
 * name of two or three letters (`faq.md`) would be read as a locale tag —
 * name documents with longer names.
 */

/** A content file, before it is parsed into a {@link DocEntry}. */
export interface DocFile {
  /** File name including the extension, e.g. `guide.zh.md`. */
  fileName: string;
  /** Raw file content: frontmatter block plus body. */
  raw: string;
}

/** A document entry — the projection the routes and components render. */
export interface DocEntry {
  /** Locale-independent slug used in the URL. */
  slug: string;
  title: string;
  description: string;
  /** Body without the frontmatter block. */
  content: string;
  /** Sort order; `Infinity` when the frontmatter has no numeric `order`. */
  order: number;
  /** Sidebar group; empty string means "no group". */
  group: string;
  /** Last-updated date (`YYYY-MM-DD`); empty string when not declared. */
  updated: string;
}

/** A sidebar group; an empty title renders the entries without a heading. */
export interface DocGroup {
  title: string;
  items: DocEntry[];
}

/** Frontmatter block: the `key: value` lines between two `---` fences. */
export interface Frontmatter {
  data: Record<string, string>;
  body: string;
}

/**
 * Split a YAML-ish frontmatter block off the top of a markdown file.
 *
 * The block is a `---` fenced list of `key: value` lines. Values are trimmed
 * strings with the surrounding quotes removed; any key is kept, unknown ones
 * included. A file without a frontmatter block has empty data and its whole
 * text as body.
 */
export function parseFrontmatter(raw: string): Frontmatter {
  const text = raw.replace(/^﻿/, '');
  const match = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);

  if (!match) return { data: {}, body: text };

  const data: Record<string, string> = {};
  for (const line of (match[1] ?? '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    const separator = trimmed.indexOf(':');
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    if (key === '') continue;

    data[key] = stripQuotes(trimmed.slice(separator + 1).trim());
  }

  return { data, body: text.slice(match[0].length) };
}

/** Remove one layer of matching single or double quotes. */
function stripQuotes(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' || first === "'") && first === last) {
      return value.slice(1, -1);
    }
  }
  return value;
}

/**
 * The locale tag of a content file name, or `undefined` when it has none.
 *
 * A tag is the dot-segment right before `.md` when it looks like a language
 * tag: two or three lowercase letters, optionally followed by a region
 * suffix (`en-US`). `guide.zh.md` → `zh`; `guide.v2.md` → none (`v2` has a
 * digit); `guide.md` → none (`guide` is not a language tag).
 */
export function detectLocaleTag(fileName: string): string | undefined {
  const withoutExtension = fileName.replace(/\.md$/i, '');
  const dot = withoutExtension.lastIndexOf('.');
  if (dot <= 0) return undefined;

  const tag = withoutExtension.slice(dot + 1);
  return /^[a-z]{2,3}(-[A-Za-z0-9]+)?$/.test(tag) ? tag : undefined;
}

/**
 * The language a content file belongs to.
 *
 * A file with a locale tag belongs to that language; every other file
 * belongs to the base locale (`locales[0]`).
 */
export function resolveContentLocale(
  fileName: string,
  locales: readonly string[]
): string {
  return detectLocaleTag(fileName) ?? locales[0] ?? 'en';
}

/**
 * The locale-independent slug of a content file name.
 *
 * The extension and the locale tag are stripped, so `guide.md` and
 * `guide.zh.md` share the slug `guide` and stay on the same page. A dotted
 * name that is not a locale tag keeps its suffix (`guide.v2`).
 */
export function contentSlug(
  fileName: string,
  locales: readonly string[]
): string {
  void locales;
  const withoutExtension = fileName.replace(/\.md$/i, '');
  const tag = detectLocaleTag(fileName);
  if (tag === undefined) return withoutExtension;
  return withoutExtension.slice(0, withoutExtension.length - tag.length - 1);
}

/**
 * The documents visible for one language.
 *
 * Files are grouped by slug; the translation of the requested language wins,
 * a missing translation falls back to the base-locale file, and files in any
 * other language are ignored. Entries are sorted by the frontmatter `order`
 * (numeric, unparsable values sort last) and then by title.
 *
 * A document without a `title` in its frontmatter is a hard error — a page
 * without a heading is a content bug, not something to silently skip.
 */
export function docsForLocale(
  locale: string,
  files: readonly DocFile[],
  baseLocale: string
): DocEntry[] {
  const bySlug = new Map<string, { file: DocFile; locale: string }>();

  for (const file of files) {
    const fileLocale = resolveContentLocale(file.fileName, [baseLocale]);
    // Files of an unrelated language are not part of this page set.
    if (fileLocale !== locale && fileLocale !== baseLocale) continue;

    const slug = contentSlug(file.fileName, [baseLocale]);
    const current = bySlug.get(slug);
    // The requested translation wins over the base-locale file.
    if (
      current === undefined ||
      (fileLocale === locale && current.locale !== locale)
    ) {
      bySlug.set(slug, { file, locale: fileLocale });
    }
  }

  const entries: DocEntry[] = [];
  for (const [slug, { file }] of bySlug) {
    entries.push(toEntry(file, slug));
  }

  return entries.sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.title.localeCompare(b.title);
  });
}

/** Project a content file into a {@link DocEntry}. */
function toEntry(file: DocFile, slug: string): DocEntry {
  const { data, body } = parseFrontmatter(file.raw);

  const title = data.title?.trim() ?? '';
  if (title === '') {
    throw new Error(
      `docs: "${file.fileName}" has no "title" in its frontmatter`
    );
  }

  return {
    slug,
    title,
    description: data.description?.trim() ?? '',
    content: body,
    order: parseOrder(data.order),
    group: data.group?.trim() ?? '',
    updated: data.updated?.trim() ?? '',
  };
}

/** Numeric `order`; anything unparsable sorts last. */
function parseOrder(value: string | undefined): number {
  if (value === undefined) return Number.POSITIVE_INFINITY;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

/**
 * Group documents for the sidebar.
 *
 * Groups are ordered by the smallest `order` inside them; documents without
 * a group come first.
 */
export function groupDocs(docs: DocEntry[]): DocGroup[] {
  const groups: DocGroup[] = [];
  const indexByTitle = new Map<string, DocGroup>();

  for (const doc of docs) {
    let group = indexByTitle.get(doc.group);
    if (!group) {
      group = { title: doc.group, items: [] };
      indexByTitle.set(doc.group, group);
      groups.push(group);
    }
    group.items.push(doc);
  }

  for (const group of groups) {
    group.items.sort(
      (a, b) => a.order - b.order || a.title.localeCompare(b.title)
    );
  }

  return groups.sort((a, b) => {
    if (a.title === '') return -1;
    if (b.title === '') return 1;
    return minOrder(a) - minOrder(b);
  });
}

/** The smallest `order` inside a group; `Infinity` for an empty group. */
function minOrder(group: DocGroup): number {
  return group.items.reduce(
    (min, doc) => Math.min(min, doc.order),
    Number.POSITIVE_INFINITY
  );
}

/** A heading of the right-hand table of contents. */
export interface DocHeading {
  id: string;
  text: string;
  level: 2 | 3;
}

/**
 * Turn heading text into a stable anchor id.
 *
 * The table of contents and the markdown renderer must agree on the id, so
 * both use this function.
 */
export function headingId(text: string): string {
  return stripInlineMarkup(text)
    .trim()
    .toLowerCase()
    .replace(/[\s　]+/g, '-')
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Remove inline markdown markers, leaving plain text. */
function stripInlineMarkup(text: string): string {
  return text
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
}

/**
 * Collect the h2 / h3 headings of a markdown body for the table of contents.
 *
 * Code blocks and block quotes are skipped so a `#` inside an example is not
 * mistaken for a heading.
 */
export function extractHeadings(markdown: string): DocHeading[] {
  const headings: DocHeading[] = [];
  let inCode = false;

  for (const line of markdown.split('\n')) {
    if (line.startsWith('```')) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;
    if (/^\s{0,3}>/.test(line)) continue;

    const match = /^(#{2,3})\s+(.+)$/.exec(line);
    if (!match) continue;

    const level = match[1]?.length === 3 ? 3 : 2;
    const text = stripInlineMarkup((match[2] ?? '').trim());
    if (!text) continue;

    headings.push({ id: headingId(text), text, level });
  }

  return headings;
}

/** A matched section inside a document. */
export interface DocSearchSection {
  id: string;
  text: string;
  level: 2 | 3;
  /** Context around the hit; empty when the section itself matched. */
  snippet: string;
}

/** One search result: a document plus the sections that matched. */
export interface DocSearchResult {
  doc: DocEntry;
  /** Matched sections (with their parents); empty when the title matched. */
  sections: DocSearchSection[];
  /** The raw query, for highlighting. */
  keyword: string;
}

/** Whether a body line can hold a search hit. */
function isSearchableLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed === '') return false;
  if (trimmed.startsWith('```')) return false;
  if (/^\|?[\s|:-]+\|?$/.test(trimmed)) return false;
  return true;
}

/** A short excerpt around the hit. */
function toSnippet(line: string, keyword: string): string {
  const text = stripInlineMarkup(line.replace(/^[-*>|\s]+/, '').trim());
  const at = text.toLowerCase().indexOf(keyword);
  if (at <= 0) return text.slice(0, 80);
  const start = Math.max(0, at - 20);
  const body = text.slice(start, at + 60);
  return start > 0 ? `…${body}` : body;
}

/**
 * Search documents by title, description and body.
 *
 * An empty query returns no results. A title or description hit returns the
 * whole document; a body hit returns the matching sections together with
 * their parent headings.
 */
export function searchDocs(docs: DocEntry[], query: string): DocSearchResult[] {
  const original = query.trim();
  const keyword = original.toLowerCase();
  if (keyword === '') return [];

  const results: DocSearchResult[] = [];

  for (const doc of docs) {
    const titleHit =
      doc.title.toLowerCase().includes(keyword) ||
      doc.description.toLowerCase().includes(keyword);
    if (titleHit) {
      results.push({ doc, sections: [], keyword: original });
      continue;
    }

    const sections: DocSearchSection[] = [];
    const matched = new Set<DocSearchSection>();
    let inCode = false;

    const ensureSection = (
      id: string,
      text: string,
      level: 2 | 3
    ): DocSearchSection => {
      const existing = sections[sections.length - 1];
      if (existing && existing.id === id && existing.text === text)
        return existing;
      const section: DocSearchSection = { id, text, level, snippet: '' };
      sections.push(section);
      return section;
    };

    for (const line of doc.content.split('\n')) {
      if (line.trim().startsWith('```')) {
        inCode = !inCode;
        continue;
      }
      if (inCode) continue;
      if (/^\s{0,3}>/.test(line)) continue;

      const heading = /^(#{2,3})\s+(.+)$/.exec(line);
      if (heading) {
        const text = stripInlineMarkup((heading[2] ?? '').trim());
        if (!text) continue;
        const level = heading[1]?.length === 3 ? 3 : 2;
        const section = ensureSection(headingId(text), text, level);
        if (section.text.toLowerCase().includes(keyword)) matched.add(section);
        continue;
      }

      if (!isSearchableLine(line)) continue;
      const plain = stripInlineMarkup(line);
      if (!plain.toLowerCase().includes(keyword)) continue;

      const target = sections[sections.length - 1];
      if (target) {
        if (target.snippet === '') target.snippet = toSnippet(line, keyword);
        matched.add(target);
      } else {
        const orphan: DocSearchSection = {
          id: '',
          text: '',
          level: 2,
          snippet: toSnippet(line, keyword),
        };
        sections.push(orphan);
        matched.add(orphan);
      }
    }

    const kept = pruneSections(sections, matched);
    if (kept.length > 0)
      results.push({ doc, sections: kept, keyword: original });
  }

  return results.sort((a, b) => {
    const aTitle = a.sections.length === 0 ? 0 : 1;
    const bTitle = b.sections.length === 0 ? 0 : 1;
    return aTitle - bTitle;
  });
}

/** Keep only the sections on the path to a hit. */
function pruneSections(
  sections: DocSearchSection[],
  matched: Set<DocSearchSection>
): DocSearchSection[] {
  const kept: DocSearchSection[] = [];

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    if (!section) continue;
    if (matched.has(section)) {
      kept.push(section);
      continue;
    }
    if (section.level !== 2) continue;

    for (let j = i + 1; j < sections.length; j++) {
      const child = sections[j];
      if (!child || child.level === 2) break;
      if (matched.has(child)) {
        kept.push(section);
        break;
      }
    }
  }

  return kept;
}

/** The previous / next document of the reading order. */
export interface DocNeighbor {
  slug: string;
  title: string;
}

/**
 * The documents before and after the given one.
 *
 * The order is continuous across groups — following "next" walks the whole
 * documentation.
 */
export function docNeighbors(
  docs: DocEntry[],
  slug: string
): { prev: DocNeighbor | undefined; next: DocNeighbor | undefined } {
  const index = docs.findIndex((doc) => doc.slug === slug);
  if (index === -1) return { prev: undefined, next: undefined };

  const toNeighbor = (doc: DocEntry | undefined): DocNeighbor | undefined =>
    doc ? { slug: doc.slug, title: doc.title } : undefined;

  return {
    prev: toNeighbor(docs[index - 1]),
    next: toNeighbor(docs[index + 1]),
  };
}

/** A card of the "next steps" section. */
export interface NextStep {
  title: string;
  href: string;
  /** Free text after the link; empty when there is none. */
  description: string;
}

/** The body without the "next steps" section plus its cards. */
export interface SplitNextSteps {
  body: string;
  steps: NextStep[];
}

/** Matches a `## Next steps` heading. */
const NEXT_STEPS_HEADING = /^##\s+(下一步|Next steps)\s*$/i;

/**
 * Cut the "next steps" section out of a markdown body.
 *
 * The section is removed from the body so it is not rendered twice.
 */
export function splitNextSteps(markdown: string): SplitNextSteps {
  const lines = markdown.split('\n');
  const start = lines.findIndex((line) => NEXT_STEPS_HEADING.test(line.trim()));
  if (start === -1) return { body: markdown, steps: [] };

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i] ?? '')) {
      end = i;
      break;
    }
  }

  const steps: NextStep[] = [];
  for (const line of lines.slice(start + 1, end)) {
    const match = /^\s{0,3}[-*]\s+\[([^\]]+)\]\(([^)\s]+)\)\s*(.*)$/.exec(line);
    if (match?.[1] !== undefined && match[2] !== undefined) {
      steps.push({
        title: match[1],
        href: match[2],
        description: (match[3] ?? '').replace(/^[\s—–-]+/, '').trim(),
      });
    }
  }

  const body = [...lines.slice(0, start), ...lines.slice(end)]
    .join('\n')
    .trimEnd();
  return { body, steps };
}

/** A relative link inside a document. */
export interface DocLinkTarget {
  slug: string;
  /** The anchor without `#`; `undefined` when the link has none. */
  hash?: string;
}

/**
 * Resolve a relative document link (`./configuration`, `../payment#stripe`)
 * to a slug and an anchor.
 *
 * Non-relative links return `undefined` — they are rendered as plain links.
 */
export function docLinkTarget(href: string): DocLinkTarget | undefined {
  const value = href.trim();
  if (!value.startsWith('./') && !value.startsWith('../')) return undefined;

  const withoutPrefix = value.replace(/^(?:\.\.?\/)+/, '');
  const hashAt = withoutPrefix.indexOf('#');
  const rawSlug =
    hashAt === -1 ? withoutPrefix : withoutPrefix.slice(0, hashAt);
  const hash = hashAt === -1 ? undefined : withoutPrefix.slice(hashAt + 1);

  const slug = rawSlug.replace(/\/+$/, '').replace(/\.md$/, '');
  if (slug === '' || slug === '.' || slug === '..') return undefined;

  return hash === undefined || hash === '' ? { slug } : { slug, hash };
}

const MONTHS_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** Days per month (non-leap year). */
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/**
 * Format a `YYYY-MM-DD` date for display.
 *
 * The date is formatted without `new Date(iso)` on purpose: that parses as
 * UTC midnight and shifts the day in western time zones.
 */
export function formatUpdatedDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return '';

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return '';

  const leap = month === 2 && year % 4 === 0 && year % 100 !== 0;
  const limit = (DAYS_IN_MONTH[month - 1] ?? 0) + (leap ? 1 : 0);
  if (day < 1 || day > limit) return '';

  const monthName = MONTHS_EN[month - 1];
  return monthName === undefined ? '' : `${monthName} ${day}, ${year}`;
}
