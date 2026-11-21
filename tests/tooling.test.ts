import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (p: string) =>
  readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('the repo is formatted by Biome, not Prettier', () => {
  const pkg = JSON.parse(read('package.json'));
  const dev = Object.keys(pkg.devDependencies ?? {});
  assert.deepEqual(
    dev.filter((d) => d.includes('prettier')),
    []
  );
  assert.ok(dev.includes('@biomejs/biome'));
  assert.match(pkg.scripts.format, /biome/);
  assert.match(pkg.scripts['format:check'], /biome/);
  assert.match(JSON.stringify(pkg['lint-staged']), /biome/);
});

test('biome.json reproduces the settings the code was written with', () => {
  const b = JSON.parse(read('biome.json'));
  const f = b.formatter;
  assert.equal(f.lineWidth, 80);
  assert.equal(f.indentStyle, 'space');
  assert.equal(f.indentWidth, 2);
  assert.equal(f.lineEnding, 'lf');
  assert.equal(b.javascript.formatter.quoteStyle, 'single');
  assert.equal(b.javascript.formatter.jsxQuoteStyle, 'double');
  assert.equal(b.javascript.formatter.semicolons, 'always');
  assert.equal(b.javascript.formatter.trailingCommas, 'es5');
  assert.equal(b.javascript.formatter.arrowParentheses, 'always');
  assert.equal(b.javascript.formatter.bracketSpacing, true);
});

test('vendored shadcn components and generated files are never formatted', () => {
  const includes = JSON.stringify(
    JSON.parse(read('biome.json')).files?.includes
  );
  for (const p of [
    'src/components/ui',
    'src/paraglide',
    'src/routeTree.gen.ts',
    'drizzle',
    '.claude',
  ]) {
    assert.ok(includes.includes(p), `biome.json must exclude ${p}`);
  }
});
