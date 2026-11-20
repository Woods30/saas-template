import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  contentSlug,
  docsForLocale,
  parseFrontmatter,
  resolveContentLocale,
  type DocFile,
} from '../src/modules/docs/paths';

const LOCALES = ['en', 'zh'] as const;

/** Build a content file with a YAML-ish frontmatter block. */
function doc(
  fileName: string,
  front: Record<string, string>,
  body = 'Body text.'
): DocFile {
  const lines = Object.entries(front).map(([key, value]) => `${key}: ${value}`);
  return {
    fileName,
    raw: `---\n${lines.join('\n')}\n---\n\n${body}\n`,
  };
}

test('resolveContentLocale falls back to the base locale without a tag', () => {
  assert.equal(resolveContentLocale('guide.md', ['en']), 'en');
  assert.equal(resolveContentLocale('guide.md', LOCALES), 'en');
});

test('resolveContentLocale reads a locale tag from the file name', () => {
  assert.equal(resolveContentLocale('guide.zh.md', LOCALES), 'zh');
  assert.equal(resolveContentLocale('guide.en.md', LOCALES), 'en');
});

test('a dotted name that is not a locale tag is not treated as one', () => {
  // "v2" contains a digit — never a locale tag.
  assert.equal(resolveContentLocale('guide.v2.md', LOCALES), 'en');
});

test('contentSlug strips the extension and the locale tag', () => {
  assert.equal(contentSlug('guide.md', LOCALES), 'guide');
  assert.equal(contentSlug('guide.zh.md', LOCALES), 'guide');
  assert.equal(contentSlug('guide.v2.md', ['en']), 'guide.v2');
});

test('parseFrontmatter reads the known keys and returns the body', () => {
  const raw = [
    '---',
    'title: Getting started',
    'description: Install and run the app',
    'order: 10',
    'group: Start here',
    'updated: 2026-11-20',
    '---',
    '',
    'First paragraph.',
    '',
    'Second paragraph.',
  ].join('\n');

  const { data, body } = parseFrontmatter(raw);

  assert.equal(data.title, 'Getting started');
  assert.equal(data.description, 'Install and run the app');
  assert.equal(data.order, '10');
  assert.equal(data.group, 'Start here');
  assert.equal(data.updated, '2026-11-20');
  assert.equal(body.trim(), 'First paragraph.\n\nSecond paragraph.');
});

test('parseFrontmatter keeps unknown keys and strips quotes', () => {
  const raw = [
    '---',
    'title: "Quoted"',
    'custom: value',
    '---',
    '',
    'Body.',
  ].join('\n');

  const { data, body } = parseFrontmatter(raw);

  assert.equal(data.title, 'Quoted');
  assert.equal(data.custom, 'value');
  assert.equal(body.trim(), 'Body.');
});

test('parseFrontmatter without a block returns the whole text as body', () => {
  const { data, body } = parseFrontmatter('Just a body.\n');

  assert.deepEqual(data, {});
  assert.equal(body, 'Just a body.\n');
});

test('docsForLocale prefers the requested translation', () => {
  const files = [
    doc('guide.md', { title: 'Guide', order: '1' }, 'English body.'),
    doc('guide.zh.md', { title: '指南', order: '1' }, 'Chinese body.'),
  ];

  const entries = docsForLocale('zh', files, 'en');

  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.title, '指南');
  assert.equal(entries[0]?.content.trim(), 'Chinese body.');
  assert.equal(entries[0]?.slug, 'guide');
});

test('docsForLocale falls back to the base locale when a translation is missing', () => {
  const files = [
    doc('guide.md', { title: 'Guide', order: '1' }, 'English body.'),
    doc('other.md', { title: 'Other', order: '2' }),
  ];

  const entries = docsForLocale('zh', files, 'en');

  assert.deepEqual(
    entries.map((entry) => entry.slug),
    ['guide', 'other']
  );
  assert.equal(entries[0]?.title, 'Guide');
});

test('docsForLocale orders by order then title', () => {
  const files = [
    doc('c.md', { title: 'C', order: '20' }),
    doc('a.md', { title: 'A', order: '10' }),
    doc('b.md', { title: 'B', order: '10' }),
    doc('d.md', { title: 'D' }),
  ];

  const entries = docsForLocale('en', files, 'en');

  assert.deepEqual(
    entries.map((entry) => entry.slug),
    ['a', 'b', 'c', 'd']
  );
});

test('docsForLocale ignores files in an unrelated locale', () => {
  const files = [
    doc('guide.md', { title: 'Guide', order: '1' }),
    doc('guide.fr.md', { title: 'Guide FR', order: '1' }),
  ];

  const entries = docsForLocale('en', files, 'en');

  assert.deepEqual(
    entries.map((entry) => entry.title),
    ['Guide']
  );
});

test('a file without a title is a hard error', () => {
  const files = [doc('guide.md', { description: 'No title here' })];

  assert.throws(() => docsForLocale('en', files, 'en'), /guide\.md/);
});
