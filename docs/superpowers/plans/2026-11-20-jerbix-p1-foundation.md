# Jerbix P1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn this repository into a clean Jerbix-branded template with no guest-posts feature and Biome as its formatter, without changing any surviving behavior.

**Architecture:** Five sequential commits, each leaving `pnpm typecheck`, `pnpm test` and `pnpm build` green. Formatting moves first so every later diff is Biome-stable; brand and LICENSE second; the guest-posts feature is removed in two passes — code paths first (which keeps the schema compiling), then schema/catalog/seeds/copy — and documentation is synced last.

**Tech Stack:** TanStack Start (Vite 8, React 19), TypeScript strict, Drizzle ORM across three dialects, Paraglide i18n, `node:test` via `tsx`, pnpm 12.

**Spec:** `docs/superpowers/specs/2026-11-20-jerbix-rebrand-design.md` (§4 品牌, §5 移除 Guest Posts, §8 手段/代码风格, §8 技能蒸馏 — the last belongs to P5, not here)

## Global Constraints

- `pnpm typecheck`, `pnpm test`, `pnpm build` must pass after **every** task. No task may leave the tree broken.
- Behavior of everything that survives is unchanged. The only intended behavior change in P1 is that guest posts no longer exist.
- Three schema templates must stay in sync: `src/config/db/schema.sqlite.ts`, `schema.postgres.ts`, `schema.mysql.ts`. `src/config/db/schema.ts` is a generated working copy — regenerate with `pnpm db:setup`, never hand-edit it.
- Never `db().transaction()` for multi-statement writes; use `atomic()`. (No new writes are added in P1 — this is a guard against "improving" things while removing.)
- Prices live in `src/config/pricing.ts`; no price ever comes from a request.
- English only: `locales: ["en"]`, no `/zh` route or redirect (`tests/english-only.test.ts` enforces it).
- `src/components/ui/*` is vendored shadcn — never edit it, and it is excluded from formatting.
- Do not rename database tables or columns. The `guest_post` table is **dropped**, which is the one sanctioned exception (spec §5).
- Commit messages: `chore:`, `feat:`, `refactor:` conventional prefixes; no attribution trailers unless the user asks.
- Do not touch `docs/superpowers/` content beyond the plan/spec themselves; the whole directory is deleted before release.

## Review Focus

Five failure modes this plan's tests do **not** fully cover. Each is pinned by a test in the task named.

1. **A deployed instance upgrades with `guest_post` rows still in the database.** Expectation: the app boots and every surviving page works; the rows become unreachable, and `pnpm db:push` drops the table. Nothing may issue a query against `guest_post` at startup — `db()` must not eagerly reference the table. *(Task 4)*
2. **Legacy post rows keep `type = 'guest'` after the feature is gone.** Expectation: they vanish from the public blog rather than rendering without a sponsored label, and neither the list nor the detail page throws. *(Task 3 — `PUBLIC_BLOG_TYPES` assertion)*
3. **An admin role that held only `admin.guest-posts.*` codes.** Expectation: removing those codes revokes exactly those actions and nothing else; every other permission the role held still matches. *(Task 4)*
4. **The client that reads `/api/config/public` for `guest_post_enabled`.** Expectation: the key simply disappears and the blog index renders without the "write for us" link — no `undefined` dereference, no crash. *(Task 3)*
5. **Biome's reformat silently changing behavior.** Expectation: the whole-repo reformat is whitespace/quotes/commas only; JSX text spacing and Tailwind class order are unchanged in effect. There is no meaningful unit test for "formatting changed nothing", so Task 1 pins it with `git diff -w`, which must be empty. *(Task 1, verification step — not a test)*

---

### Task 1: Biome replaces Prettier

**Files:**
- Create: `biome.json`
- Create: `tests/tooling.test.ts`
- Modify: `package.json` (scripts `format` / `format:check`, `lint-staged`, `devDependencies`)
- Delete: `.prettierrc.json`, `.prettierignore`

**Interfaces:**
- Consumes: nothing.
- Produces: `pnpm format` and `pnpm format:check` run Biome; `biome.json` at repo root is the single formatter config for every later task.

The values below are copied from the current `.prettierrc.json` on purpose — a formatter migration that also changes the rules turns one reviewable commit into a whole-repo rewrite.

- [x] **Step 1: Write the failing test**

`tests/tooling.test.ts`:

```ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('the repo is formatted by Biome, not Prettier', () => {
  const pkg = JSON.parse(read('package.json'));
  const dev = Object.keys(pkg.devDependencies ?? {});
  assert.deepEqual(dev.filter((d) => d.includes('prettier')), []);
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
  const includes = JSON.stringify(JSON.parse(read('biome.json')).files?.includes);
  for (const p of ['src/components/ui', 'src/paraglide', 'src/routeTree.gen.ts', 'drizzle', '.claude']) {
    assert.ok(includes.includes(p), `biome.json must exclude ${p}`);
  }
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/tooling.test.ts`
Expected: FAIL — `ENOENT` on `biome.json`.

- [x] **Step 3: Add `biome.json`, rewrite the scripts, drop Prettier**

`biome.json` — `lineWidth: 80` and `trailingCommas: "es5"` are the non-obvious ones; anything else changes every file in the repo.

`package.json`:
- `devDependencies`: remove `prettier`, `@ianvs/prettier-plugin-sort-imports`, `prettier-plugin-tailwindcss`; add `@biomejs/biome`.
- `scripts.format`: `biome check --write .`
- `scripts.format:check`: `biome check .`
- `lint-staged`: `{ "*.{ts,tsx,js,jsx,mjs,cjs,json,css,md,mdx,yaml,yml}": "biome check --write --no-errors-on-unmatched" }`
- Keep `.husky/pre-commit` as `npx lint-staged`.

Import-order groups must mirror `.prettierrc.json` exactly: react → `@tanstack/*` → third-party → blank → `@/core` → `@/config` → `@/modules` → `@/lib` → `@/paraglide` → `@/hooks` → `@/blocks` → `@/components` → `@/content` → blank → relative. Enable Tailwind class sorting via `useSortedClasses` but **not** in unsafe mode.

- [x] **Step 4: Run the test to verify it passes**

Run: `node --import tsx --test tests/tooling.test.ts`
Expected: PASS, 3/3.

- [x] **Step 5: Reformat the whole repo and prove it is formatting-only**

Run: `pnpm format`, then `pnpm typecheck && pnpm test && pnpm build` — all green.

Then review the reformat itself:

```bash
git add -A && git diff --cached -w -U0 | grep -E '^[+-]' | grep -vE '^(\+\+\+|---)'
```

Expected: every remaining line differs only by quote style, trailing commas, import order,
or line wrapping. Biome and Prettier do **not** wrap identically, so a non-empty diff is
normal and not a failure. The failure condition is a changed **identifier, string literal
or number** — if any hunk does that, revert the file, fix `biome.json` to match Prettier's
behaviour, and re-run. Never accept a token change as "just formatting".

- [x] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: replace prettier with biome"
```

---

### Task 2: Jerbix brand and a self-authored LICENSE

**Files:**
- Create: `LICENSE`
- Create: `tests/brand.test.ts`
- Modify: `src/config/index.ts`, `.env.example`, `src/routes/__root.tsx`
- Modify: `public/favicon.svg` (replace), `public/logo.svg` (replace with the text mark)

**Interfaces:**
- Consumes: nothing.
- Produces: `envConfigs.app_name` defaults to `Jerbix`; the repo contains no upstream brand string outside `docs/superpowers/`.

- [x] **Step 1: Write the failing test**

`tests/brand.test.ts`:

```ts
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('LICENSE is Jerbix own text, not an upstream licence', () => {
  const license = read('LICENSE');
  assert.match(license, /Jerbix/);
  assert.match(license, /Personal/);
  assert.match(license, /Team/);
  assert.match(license, /may not (re-?sell|redistribute)/i);
  for (const upstream of ['shipany', 'Apache License', 'MIT License']) {
    assert.ok(!license.toLowerCase().includes(upstream.toLowerCase()), upstream);
  }
});

test('no upstream brand string survives outside the design docs', () => {
  const out = execFileSync(
    'git',
    ['grep', '-il', 'shipany', '--', '.', ':!docs/superpowers', ':!pnpm-lock.yaml'],
    { encoding: 'utf8', cwd: new URL('..', import.meta.url) }
  );
  assert.equal(out.trim(), '');
});

test('the app defaults to the Jerbix name', () => {
  assert.match(read('.env.example'), /VITE_APP_NAME=Jerbix/);
  const config = read('src/config/index.ts');
  assert.ok(!config.includes('My App'), 'placeholder app name must be gone');
  const messages = JSON.parse(read('messages/en.json'));
  assert.ok(!String(messages['common.metadata.title']).includes('My App'));
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/brand.test.ts`
Expected: FAIL — `ENOENT` on `LICENSE`.

- [x] **Step 3: Write LICENSE, sweep the brand**

`LICENSE`: two tiers, **Personal** (one person, unlimited products) and **Team** (multi-seat, unlimited products); both forbid reselling the template itself; no warranty; enterprise enquiries by email rather than a third tier. Drafted from scratch — no sentence may resemble the previous licence text (spec §4).

Brand sweep:
- `.env.example`: `VITE_APP_NAME=Jerbix`, description, `VITE_APP_URL` stays `http://localhost:3000`.
- `src/config/index.ts`: default `app_name` `Jerbix`; default meta title `Jerbix — the SaaS starter that takes payments`; email sender display name follows `app_name`.
- `src/routes/__root.tsx`: title/description defaults, favicon link.
- `public/favicon.svg`: the ledger-tick mark as a hand-written SVG. `public/logo.svg`: the text mark. No raster assets.

- [x] **Step 4: Run the test to verify it passes**

Run: `node --import tsx --test tests/brand.test.ts`
Expected: PASS, 3/3.

- [x] **Step 5: Verify the whole suite**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: green.

- [x] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: rebrand to jerbix with a bespoke commercial licence"
```

---

### Task 3: Remove guest posts — code paths

Removes every consumer of the feature while `guest_post` still exists in the schema, so the tree keeps compiling until Task 4 drops it.

**Files:**
- Delete: `src/modules/guest-posts/service.ts`, `src/server/guest-posts/api.ts`, `src/server/guest-posts/settings.ts`, `src/server/admin/handlers/guest-posts.ts`, `src/server/admin/handlers/guest-posts-id.ts`, `src/blocks/guest-post.tsx`, `src/hooks/use-guest-posts.ts`, `src/hooks/use-guest-post-checkout.ts`, `src/lib/guest-post-rules.ts`, `src/routes/guest-post.tsx`, `src/routes/admin/guest-posts.tsx`, `src/routes/settings/guest-posts/index.tsx`, `src/routes/settings/guest-posts/$id.tsx`, `src/routes/settings/guest-posts/-shared.tsx`, `src/routes/api/guest-posts.ts`, `src/routes/api/guest-posts/$id.ts`, `src/routes/api/guest-posts/$id/checkout.ts`, `src/routes/api/guest-posts/info.ts`, `src/routes/api/admin/guest-posts.ts`, `src/routes/api/admin/guest-posts/$id.ts`, `src/routes/api/admin/guest-posts/$id/reject.ts`, `src/routes/api/admin/guest-posts/$id/restore.ts`, `tests/guest-posts.test.ts`, `tests/guest-post-notify.test.ts`
- Modify: `src/routes/admin/route.tsx`, `src/routes/settings/route.tsx`, `src/routes/settings/index.tsx`, `src/routes/settings/payments.tsx`, `src/routes/blog/index.tsx`, `src/routes/blog/$slug.tsx`, `src/content/posts/index.ts`, `src/modules/posts/service.ts`, `src/modules/payment/service.ts`, `src/modules/notify/service.ts`, `src/modules/notify/templates.ts`, `src/modules/config/settings.ts`, `src/routes/api/payment/checkout.ts`, `src/routes/api/user/orders.ts`, `src/lib/admin-operations.ts`, `src/server/admin/handlers.ts`, `src/server/admin/handlers/posts.ts`, `src/server/admin/handlers/settings-test.ts`
- Test: `tests/guest-post-removal.test.ts`

**Interfaces:**
- Consumes: Task 1's Biome config (all new code must be Biome-clean).
- Produces: no route, hook, block, module or notify channel mentions guest posts; `post.type` no longer has a `'guest'` member; `settings.ts` no longer declares `guest_post_enabled`, `guest_post_min_words`, `notify_guest_post_enabled` or the `guest_post` setting group.

- [x] **Step 1: Write the failing test**

`tests/guest-post-removal.test.ts`:

```ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('public config no longer advertises guest-post switches', () => {
  const settings = read('src/modules/config/settings.ts');
  assert.ok(!settings.includes('guest_post_enabled'));
  assert.ok(!settings.includes('guest_post_min_words'));
  assert.ok(!settings.includes('notify_guest_post_enabled'));
});

test('the admin agent surface no longer exposes guest-post operations', () => {
  const ops = read('src/lib/admin-operations.ts');
  assert.ok(!ops.includes('guest_posts_list'));
  assert.ok(!ops.includes('admin.guest-posts'));
});

test('the public blog can only surface article rows', async () => {
  const { PUBLIC_BLOG_TYPES } = await import('../src/modules/posts/service');
  assert.deepEqual([...PUBLIC_BLOG_TYPES], ['article']);
});
```

`PUBLIC_BLOG_TYPES` is the renamed, exported `BLOG_TYPES`. Today it is `[ARTICLE, GUEST]`, so a migrated database still full of `type='guest'` rows would keep publishing them; after this task it is `[ARTICLE]` and those rows simply stop appearing in the blog list. That is the intended degradation — invisible, never a crash. No sanitising helper is needed: the existing `inArray(post.type, PUBLIC_BLOG_TYPES)` filter already does the work.

- [x] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/guest-post-removal.test.ts`
Expected: FAIL on the first assertion (`settings.ts` still declares the switch); the third test fails with `normalizePostType` not exported.

- [x] **Step 3: Delete the feature and add `normalizePostType`**

Delete the files listed above. Then:

- `src/modules/posts/service.ts`: delete `PostType.GUEST` and rename `BLOG_TYPES` to the
  exported `PUBLIC_BLOG_TYPES = [PostType.ARTICLE]`. The detail query must filter on it too,
  so an orphaned guest row 404s instead of rendering bare.
- `src/content/posts/index.ts`: drop the `guest` / `preview` members and `guestPostId`.
- `src/routes/blog/index.tsx`: drop the `guestPostsOpen` loader field and the "write for us" link.
- `src/routes/blog/$slug.tsx`: drop the sponsored label, the `utm_medium=guest_post` link rewriting and the `?preview=1` branch.
- `src/modules/payment/service.ts`: drop `planGuestPostFulfillment` / `planGuestPostRefund` and the `order.reference = 'guest_post:<id>'` branch; settlement keeps the generic `reference` hook.
- `src/modules/notify/service.ts` + `templates.ts`: drop the guest-post template, `notifyGuestPostSubmitted`, and its sample payload.
- `src/modules/config/settings.ts`: drop the three fields and the `guest_post` group.
- `src/lib/admin-operations.ts`: drop `guest_posts_list` and `guestPostStatus`.
- `src/routes/admin/route.tsx`, `src/routes/settings/route.tsx`, `src/routes/settings/index.tsx`, `src/routes/settings/payments.tsx`: drop the nav entries and the guest-post summary cards.
- `src/routes/api/payment/checkout.ts`, `src/routes/api/user/orders.ts`, `src/server/admin/handlers/posts.ts`, `src/server/admin/handlers/settings-test.ts`: drop the guest-post branches and test fixtures.

- [x] **Step 4: Run the test to verify it passes**

Run: `node --import tsx --test tests/guest-post-removal.test.ts`
Expected: PASS, 3/3.

- [x] **Step 5: Verify nothing regressed**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: green. Test count drops by the two deleted files.

- [x] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: remove guest posts from every code path"
```

---

### Task 4: Remove guest posts — data, catalog, seeds and copy

**Files:**
- Modify: `src/config/db/schema.sqlite.ts`, `schema.postgres.ts`, `schema.mysql.ts` (regenerate `schema.ts` with `pnpm db:setup`)
- Modify: `src/config/pricing.ts`, `scripts/init-rbac.ts`, `messages/en.json`
- Test: `tests/guest-post-data.test.ts`

**Interfaces:**
- Consumes: Task 3 (no code reads `guest_post` any more).
- Produces: `guestPost` gone from all three templates; `pricingCatalog` has no `kind: 'guest_post'` entry and no `listGuestPostPackages()`; `init-rbac.ts` seeds no `admin.guest-posts.*` code.

- [x] **Step 1: Write the failing test**

`tests/guest-post-data.test.ts`:

```ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const dialects = ['sqlite', 'postgres', 'mysql'] as const;

test('no schema template declares the guest_post table', () => {
  for (const d of dialects) {
    const src = read(`src/config/db/schema.${d}.ts`);
    assert.ok(!src.includes("'guest_post'"), d);
    assert.ok(!src.includes('guestPost'), d);
  }
});

test('the pricing catalog has no guest-post packages', async () => {
  const { pricingCatalog } = await import('../src/config/pricing');
  const kinds = Object.values(pricingCatalog).map((p: any) => p.kind);
  assert.ok(!kinds.includes('guest_post'));
});

test('no message key mentions guest posts', () => {
  const keys = Object.keys(JSON.parse(read('messages/en.json')));
  assert.deepEqual(keys.filter((k) => /guest.?post/i.test(k)), []);
});

test('RBAC seeds no guest-post permission codes', () => {
  const seeds = read('scripts/init-rbac.ts');
  assert.ok(!seeds.includes('admin.guest-posts'));
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/guest-post-data.test.ts`
Expected: FAIL — `schema.sqlite.ts` still contains `guest_post`.

- [x] **Step 3: Drop the table, catalog entries, seeds and copy**

- Three schema templates: delete the `guestPost` table definition and its `GuestPost` / `NewGuestPost` exports. In the `order` comment at line ~245, drop the ``guest_post:<id>`` example, keeping `reference` documented generically.
- `pnpm db:setup` to regenerate `src/config/db/schema.ts`.
- `pnpm db:push` to drop the table in the local database.
- `src/config/pricing.ts`: delete `guest_post_standard`, `guest_post_premium`, `listGuestPostPackages()`, and the `kind?: 'guest_post'` member with its doc comment. If `kind` then has no members left, delete the field entirely.
- `scripts/init-rbac.ts`: delete the three `admin.guest-posts.*` permission entries and their grants in the role lists around lines 355–386.
- `messages/en.json`: delete every `guest_posts.*`, `admin.guest_posts.*`, `settings.guest_posts.*` key (69 in the `guest_posts` group alone) plus `blog.write_for_us`, `blog.sponsored`, `blog.preview_banner`, `guest_posts.preview`.

- [x] **Step 4: Run the test to verify it passes**

Run: `node --import tsx --test tests/guest-post-data.test.ts`
Expected: PASS, 4/4.

- [x] **Step 5: Verify the greps and the suite**

```bash
rg -i "guest.?post" src/ scripts/ tests/ messages/    # expect: no output
pnpm typecheck && pnpm test && pnpm build              # expect: green
```

Also confirm an admin role holding only `admin.users.read` still matches that permission after the seed change (the `rolev` fixture in `tests/admin-agent.test.ts` covers the general case; re-run it).

- [x] **Step 6: Commit**

```bash
git add -A
git commit -m "feat!: drop the guest_post table, pricing packages and rbac seeds"
```

This is the one breaking schema change in P1 — note it for the README upgrade section written in Task 5.

---

### Task 5: Sync AGENTS.md and README.md

**Files:**
- Modify: `AGENTS.md`, `README.md`
- Test: `tests/docs-sync.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4. This task documents what those tasks shipped; it must not describe anything not yet built (the admin and marketing work land in P2/P3).
- Produces: no command or table in the docs that the repo no longer has.

- [x] **Step 1: Write the failing test**

`tests/docs-sync.test.ts`:

```ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('the docs do not mention guest posts or prettier', () => {
  for (const doc of ['AGENTS.md', 'README.md']) {
    const text = read(doc);
    assert.ok(!/guest.?post/i.test(text), `${doc} still mentions guest posts`);
    assert.ok(!/prettier/i.test(text), `${doc} still mentions prettier`);
    assert.ok(!/\/blog\/write-for-us/i.test(text), doc);
  }
});

test('AGENTS.md documents the real command surface', () => {
  const text = read('AGENTS.md');
  assert.match(text, /pnpm format/);
  assert.match(text, /biome/i);
  assert.ok(!text.includes('admin.operations.read') || text.includes('/admin/analytics'));
});
```

The last assertion is deliberately loose: it only fires if P3's rename has landed while the docs still say `admin.operations.read`. It passes today.

- [x] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test tests/docs-sync.test.ts`
Expected: FAIL — `AGENTS.md` still contains guest-post sections and `Prettier`.

- [x] **Step 3: Rewrite the affected doc sections**

`AGENTS.md`:
- Modules list: remove the guest-posts entry and its "How modules connect" paragraph; remove the payment → guest-posts dependency bullet, leaving credits/subscriptions and ai-tasks.
- Commands: `pnpm format` / `pnpm format:check` described as Biome.
- Database Schema: remove `guestPost` from the Content line.
- Testing: remove `guest-posts` from the focus list.
- Adding a New Feature: drop the guest-post example if referenced.

`README.md`:
- Feature list: remove paid guest posts.
- Add an **Upgrade notes** section stating that schema migration drops `guest_post` and its rows, and that an existing deployment must re-run `pnpm db:push` (or apply the generated migration).

- [x] **Step 4: Run the test to verify it passes**

Run: `node --import tsx --test tests/docs-sync.test.ts`
Expected: PASS, 2/2.

- [x] **Step 5: Verify the full suite and build**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: green. Report the total test count — it is the baseline for P2.

- [x] **Step 6: Commit**

```bash
git add -A
git commit -m "docs: sync agents.md and readme with the foundation changes"
```

---

## Out of scope for P1 (landing in later plans)

| Work | Plan |
|---|---|
| Ledger tokens, themes, blocks rewrite, landing page, i18n regrouping to `site.*`/`product.*` | P2 |
| `analytics_visitor` UTM columns, `REPORT_TIMEZONE`, period selector, dashboard, `/admin/analytics`, permission + agent API rename | P3 |
| Equivalent rewriting of ~265 files, comments, env/config rewrites, similarity measurement | P4 |
| Skills 9 → 8, `new-app` rename, distillation | P5 |
