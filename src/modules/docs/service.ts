/**
 * Docs module — content loader.
 *
 * The content files are bundled at build time (`import.meta.glob`), so the
 * documentation ships with the app and needs no database. The pure logic
 * lives in `./paths.ts`; this module only binds the file table to it.
 *
 * Note: `import.meta.glob` does not exist under plain node, so this module
 * cannot be imported by `node --test` — tests import `./paths.ts` instead.
 */

import { baseLocale } from '@/paraglide/runtime.js';

import {
  contentSlug,
  docsForLocale as docsForLocalePure,
  type DocEntry,
  type DocFile,
} from './paths';

/** Every markdown file under `content/docs`, keyed by its path. */
const DOC_FILES = import.meta.glob('/content/docs/**/*.md', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

/** The content files as {@link DocFile}s (file name + raw text). */
function collectFiles(): DocFile[] {
  return Object.entries(DOC_FILES).map(([path, raw]) => ({
    fileName: path.split('/').pop() ?? path,
    raw,
  }));
}

/**
 * The documents of one language.
 *
 * A missing translation falls back to the base-locale file.
 */
export function docsForLocale(locale: string): DocEntry[] {
  return docsForLocalePure(locale, collectFiles(), baseLocale);
}

/** One document by its slug; `undefined` when there is none. */
export function findDocBySlug(
  slug: string,
  locale: string
): DocEntry | undefined {
  return docsForLocale(locale).find((doc) => doc.slug === slug);
}

/** The slug of a content file name (locale tag stripped). */
export { contentSlug };

export {
  docLinkTarget,
  docNeighbors,
  extractHeadings,
  formatUpdatedDate,
  groupDocs,
  headingId,
  searchDocs,
  splitNextSteps,
  type DocEntry,
  type DocGroup,
  type DocHeading,
  type DocLinkTarget,
  type DocNeighbor,
  type DocSearchResult,
  type DocSearchSection,
  type NextStep,
} from './paths';
