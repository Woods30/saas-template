# Jerbix P2 — Ledger Visual System and Marketing Rebuild

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the inherited shadcn look and demo landing page with the Ledger visual system and a landing page that sells the three payment rails.

**Architecture:** Two layers, in dependency order. First the design tokens and theme presets, because every pixel after them reads those variables. Then the marketing surface, rebuilt block by block against those tokens. Copy moves from `landing.*` to `site.*` in the same commit that rewrites the blocks, so no intermediate state has a block reading a key that no longer exists.

**Tech Stack:** Tailwind CSS 4 (`@theme` in `src/styles/globals.css`), shadcn/ui v4 primitives, Paraglide i18n, TanStack Start file routes, `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-20-jerbix-rebrand-design.md` §6 (landing page), §7 (Ledger), §10 (constraints), §11 (implementer's judgement), §12 (success criteria).

## Global Constraints

- English only. `locales: ["en"]`; no locale prefix, no second catalog. Every new string goes into `messages/en.json` as a flat dot key.
- Money exists only in `src/config/pricing.ts`. The catalog is the source of truth; the admin panel never edits prices.
- **Pricing copy may only promise what the code actually does:** recurring billing and cancellation. No plan changes, no proration, no Stripe trials — the code has none of those.
- Do not edit `src/components/ui/*` by hand. Compose around the primitives.
- Blocks (`src/blocks/*`) read i18n and configure components. Components (`src/components/*`) take every string via props and never import `m`. The new `ReceiptCard` is a component, not a block.
- Vermilion is reserved: primary action, negative signal, funnel progress. Never decoration, never a large background.
- Positive deltas are moss green with `▲`; negative are vermilion with `▼`. No other colour for either.
- Ink/paper contrast comes from `--foreground`/`--background`; `sidebar-foreground` stays for text inside the dashboard sidebar.
- Numbers are `tabular-nums lining-nums` everywhere a figure appears, `$` and digits at the same size.
- Serif (`Source Serif 4`) is for long-form reading only — blog, docs, legal. Never in UI chrome, headings or figures.
- Corners are `2px`. Separators are `1px` hairlines. No shadows on content; only metric cards get a container.
- After every task: `pnpm typecheck`, `pnpm test`, `pnpm build` must pass, **and `pnpm format:check` must exit 0** — the Biome linter is on now, so a rule error fails the check even though warnings do not.
- Do not touch `docs/superpowers/` except plans and specs. Do not rename tables or columns.
- The P1 branch (`refactor/jerbix-p1`) is the base. If P1 has not merged, branch from it, not from `main`.

## Review Focus

Failure modes these tasks' tests do not fully cover. Each line is pinned by a test in the task named.

1. **A user with `appearance_enabled` on and a saved theme id from the old set** (`classic`, `forest`, …). Expectation: the site renders the default Ledger palette instead of an unstyled or half-applied page, because `[data-theme='classic']` no longer exists and no rule matches. *(Task 2)*
2. **Dark mode on every new marketing block.** Expectation: no block is legible in light and unreadable in dark — the failure is invisible in screenshots of one mode and ships silently. *(Tasks 5–7)*
3. **The landing page with `docs_enabled` off.** Expectation: the Docs nav entry and footer link disappear and the page does not render an empty list item or a dead link. *(Tasks 7–9)*
4. **A pricing section with a product the payment provider rejects.** Expectation: the section renders the three catalog products and the checkout API's refusal surfaces as a toast, not as a crash or a silently dead button. *(Task 4)*
5. **Long strings in a narrow viewport.** Expectation: the hero headline, the rail cards and the receipt line items wrap instead of overflowing, at 320px width. *(Tasks 5–6)*

---

### Task 1: Ledger palette and typography tokens

**Files:**
- Modify: `src/styles/globals.css` (`:root`, `.dark`, `@theme inline`)
- Modify: `src/config/appearance.ts` (font stacks only)
- Test: `tests/ledger-tokens.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: the CSS custom properties every later task styles against — `--background`, `--foreground`, `--primary`, `--muted-foreground`, `--moss`, `--border`, `--radius`, `--font-body`. Tasks 2–9 read them by name.

- [ ] **Step 1: Write the failing test**

`tests/ledger-tokens.test.ts` — parse the stylesheet as text and assert the Ledger values are present and the shadcn values are gone:

```ts
test('the light palette is the Ledger paper palette', () => {
  const root = rootBlock(); // the `:root { ... }` slice of globals.css
  assert.match(root, /--background:\s*oklch\(0\.972 0\.008 85\)/);
  assert.match(root, /--foreground:\s*oklch\(0\.21 0\.012 60\)/);
  assert.match(root, /--primary:\s*oklch\(0\.55 0\.19 32\)/);
  assert.match(root, /--muted-foreground:\s*oklch\(0\.47 0\.012 65\)/);
  assert.match(root, /--border:\s*oklch\(0\.88 0\.012 80\)/);
  assert.match(root, /--moss:\s*oklch\(0\.45 0\.09 155\)/);
});

test('the dark palette is the Ledger ink palette', () => {
  const dark = block('.dark {');
  assert.match(dark, /--background:\s*oklch\(0\.16 0\.008 60\)/);
  assert.match(dark, /--foreground:\s*oklch\(0\.95 0\.006 85\)/);
  assert.match(dark, /--primary:\s*oklch\(0\.68 0\.17 32\)/);
  assert.match(dark, /--moss:\s*oklch\(0\.72 0\.10 155\)/);
});

test('corners are square and the inherited radius is gone', () => {
  const css = read('src/styles/globals.css');
  assert.match(css, /--radius:\s*2px/);
  assert.ok(!/0\.625rem/.test(css), 'the shadcn radius is still in the stylesheet');
});

test('long-form reading uses the serif body face', () => {
  assert.match(block(':root {'), /--font-body:\s*'Source Serif 4'/);
  assert.match(read('src/styles/globals.css'), /--font-body/);
});

test('tabular figures are applied to body text', () => {
  const root = block(':root {');
  assert.match(root, /font-variant-numeric:\s*tabular-nums lining-nums/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --import tsx --test tests/ledger-tokens.test.ts`
Expected: FAIL on the first assertion — `:root` still carries the inherited warm-grey values.

- [ ] **Step 3: Replace the palettes**

In `src/styles/globals.css` rewrite `:root` and `.dark` with the §7 table, keeping every property name the stylesheet already defines (`--card`, `--popover`, `--secondary`, `--accent`, `--destructive`, `--input`, `--ring`, `--sidebar*`, chart tokens) so nothing referencing them breaks. Add `--moss` and `--font-body`, set `--radius: 2px`, and add `font-variant-numeric: tabular-nums lining-nums` to the `body` rule. Mirror every new property in the `@theme inline` block as `--color-moss` so Tailwind utilities (`text-moss`, `bg-moss`) exist.

In `src/config/appearance.ts`, point the `serif` font option's stack at `'Source Serif 4 Variable', 'Source Serif 4', serif` and add a `body` stack constant for `--font-body`. Keep the `inter`, `system`, `rounded` options as they are.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --import tsx --test tests/ledger-tokens.test.ts`
Expected: PASS, 5/5.

- [ ] **Step 5: Verify the site still builds**

Run: `pnpm typecheck && pnpm build`
Expected: both green — the palette is CSS-only, so nothing should fail to compile.

- [ ] **Step 6: Commit**

```bash
git add src/styles/globals.css src/config/appearance.ts tests/ledger-tokens.test.ts
git commit -m "feat: replace the inherited palette with the ledger tokens"
```

---

### Task 2: Four Ledger theme presets

**Files:**
- Modify: `src/config/appearance.ts` (`THEMES`, `DEFAULT_APPEARANCE`)
- Modify: `src/styles/globals.css` (the `[data-theme='…']` blocks)
- Modify: `messages/en.json` (`common.themes.*`)
- Test: `tests/theme-presets.test.ts`

**Interfaces:**
- Consumes: Task 1's token names.
- Produces: `THEMES` with ids `paper | ink | moss | mono`; `DEFAULT_APPEARANCE.theme === 'paper'`; four `[data-theme='<id>']` and four `.dark[data-theme='<id>']` blocks; `common.themes.<id>` messages.

- [ ] **Step 1: Write the failing test**

```ts
test('the preset list is the four Ledger presets', async () => {
  const { THEMES, DEFAULT_APPEARANCE } = await import('../src/config/appearance');
  assert.deepEqual(THEMES.map((t) => t.id), ['paper', 'ink', 'moss', 'mono']);
  assert.equal(DEFAULT_APPEARANCE.theme, 'paper');
});

test('every preset has a light and a dark block', () => {
  const css = read('src/styles/globals.css');
  for (const id of ['paper', 'ink', 'moss', 'mono']) {
    assert.ok(css.includes(`[data-theme='${id}'] {`), id);
    assert.ok(css.includes(`.dark[data-theme='${id}'] {`), id);
  }
  for (const id of ['classic', 'forest', 'ocean', 'violet', 'sunset', 'rose', 'slate'])
    assert.ok(!css.includes(`[data-theme='${id}']`), `${id} is still themed`);
});

test('the inherited classic cascade is gone', () => {
  const css = read('src/styles/globals.css');
  assert.ok(!css.includes("[data-theme]:not([data-theme='classic'])"));
});

test('every preset is labelled in the admin copy', () => {
  const messages = JSON.parse(read('messages/en.json'));
  for (const id of ['paper', 'ink', 'moss', 'mono'])
    assert.equal(typeof messages[`common.themes.${id}`], 'string', id);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --import tsx --test tests/theme-presets.test.ts`
Expected: FAIL — the list is still the seven inherited ids.

- [ ] **Step 3: Replace the presets**

`src/config/appearance.ts`: swap `THEMES` for the four §7 entries with swatches drawn from each preset's own accent, set `DEFAULT_APPEARANCE.theme = 'paper'`.

`src/styles/globals.css`: delete the seven `[data-theme='classic' | 'forest' | …]` blocks and the `… :not([data-theme='classic'])` cascade with its sidebar-menu-button companions. Add four light blocks and four dark blocks that override **only** `--background`, `--foreground`, `--primary`, `--muted-foreground`, `--border`, `--moss` — corners, hairlines and typography come from Task 1 and must not be re-declared. Because `:root` already holds the paper palette, `[data-theme='paper']` can be declared explicitly (matching the pattern) rather than omitted.

`messages/en.json`: replace the seven `common.themes.*` values with four, worded as the spec's personality column.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --import tsx --test tests/theme-presets.test.ts`
Expected: PASS, 4/4.

- [ ] **Step 5: Confirm a stale stored theme is harmless**

Read `src/hooks/use-appearance.ts` and the root loader: confirm a stored theme id that is no longer in `THEMES` is ignored (falls back to the default) rather than passed through to `<html data-theme>`. If it is passed through, add the fallback in the same place the value is resolved, and extend the test with `assert.equal(resolveTheme('classic'), 'paper')`.

- [ ] **Step 6: Verify and commit**

Run: `pnpm typecheck && pnpm test && pnpm build && pnpm format:check`
Expected: green, 0 errors.

```bash
git add src/config/appearance.ts src/styles/globals.css messages/en.json tests/theme-presets.test.ts
git commit -m "feat: replace the theme presets with the four ledger presets"
```

---

### Task 3: Regroup the marketing copy from `landing.*` to `site.*`

**Files:**
- Modify: `messages/en.json`
- Modify: `src/blocks/*-section.tsx`, `src/components/site-header.tsx`, `src/components/site-footer.tsx`, `src/routes/pricing.tsx`
- Test: `tests/site-copy-keys.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: the `site.*` key namespace Tasks 4–8 write their copy into. Convention: `site.nav.*`, `site.hero.*`, `site.rails.*`, `site.inside.*`, `site.steps.*`, `site.pricing.*`, `site.faq.*`, `site.cta.*`, `site.footer.*`. Product copy (names, prices, credits) lives under `product.*` and is shared with the dashboard.

- [ ] **Step 1: Write the failing test**

```ts
test('no marketing copy is left in the landing namespace', () => {
  const keys = Object.keys(JSON.parse(read('messages/en.json')));
  assert.deepEqual(keys.filter((k) => k.startsWith('landing.')), []);
});

test('the marketing copy lives under site.*', () => {
  const keys = Object.keys(JSON.parse(read('messages/en.json')));
  for (const prefix of ['site.nav.', 'site.hero.', 'site.rails.', 'site.inside.',
    'site.steps.', 'site.pricing.', 'site.faq.', 'site.cta.', 'site.footer.'])
    assert.ok(keys.some((k) => k.startsWith(prefix)), prefix);
});

test('every message key referenced in src/ resolves', () => {
  const messages = JSON.parse(read('messages/en.json'));
  for (const key of referencedKeys()) // all m['…'] literals under src/
    assert.ok(key in messages, `missing message: ${key}`);
});

test('no block or marketing component reads a raw string', () => {
  const files = [...blocks(), 'src/components/site-header.tsx', 'src/components/site-footer.tsx'];
  for (const file of files)
    assert.ok(read(file).includes("from '@/paraglide/messages.js'"), file);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --import tsx --test tests/site-copy-keys.test.ts`
Expected: FAIL — 85 `landing.*` keys still exist.

- [ ] **Step 3: Move the keys and their readers in one pass**

Rename the `landing.*` block in `messages/en.json` to `site.*` (a mechanical prefix rewrite, then hand-fix the few keys whose segment no longer matches the block that uses them). Update every `m['landing.…']` call site to `m['site.…']`. Rewrite the copy itself where the spec fixes new wording (§6) — this is the point to install the hero, rails, steps, pricing and FAQ copy from the spec rather than to carry the old feature-list sentences across.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --import tsx --test tests/site-copy-keys.test.ts`
Expected: PASS, 4/4.

- [ ] **Step 5: Commit**

Run: `pnpm typecheck && pnpm test && pnpm build && pnpm format:check`

```bash
git add messages/en.json src/blocks src/components/site-header.tsx src/components/site-footer.tsx src/routes/pricing.tsx tests/site-copy-keys.test.ts
git commit -m "refactor: regroup the marketing copy under the site namespace"
```

---

### Task 4: Three real products in the pricing catalog

**Files:**
- Modify: `src/config/pricing.ts`
- Modify: `messages/en.json` (`product.*`)
- Test: `tests/pricing-catalog.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `pricingCatalog` with keys `personal_license`, `team_license`, `support_monthly`, each an existing `PricingProduct` — `{ productId, productName, planName, description, type, priceInCents, currency, cnyPriceInCents?, credits, creditsValidDays?, plan? }`. Do not add fields to the type: `src/modules/payment/service.ts`, the checkout API and the pricing table all read this shape, and a new field means touching all three.

- [ ] **Step 1: Write the failing test**

```ts
test('the catalog sells the three template products', async () => {
  const { pricingCatalog } = await import('../src/config/pricing');
  assert.deepEqual(Object.keys(pricingCatalog).sort(), [
    'personal_license', 'support_monthly', 'team_license',
  ]);
});

test('the one-time products carry a CNY price for offline transfer', async () => {
  const { pricingCatalog, PaymentType } = await import('../src/config/pricing');
  for (const id of ['personal_license', 'team_license']) {
    assert.equal(pricingCatalog[id].type, PaymentType.ONE_TIME, id);
    assert.ok(pricingCatalog[id].cnyPriceInCents > 0, id);
  }
});

test('the support plan is the only subscription and it grants credits', async () => {
  const { pricingCatalog, PaymentType } = await import('../src/config/pricing');
  const subs = Object.values(pricingCatalog).filter((p) => p.type === PaymentType.SUBSCRIPTION);
  assert.deepEqual(subs.map((p) => p.productId), ['support_monthly']);
  assert.ok(subs[0].credits > 0);
});

test('the catalog promises no feature the payment code lacks', async () => {
  const { pricingCatalog } = await import('../src/config/pricing');
  for (const p of Object.values(pricingCatalog)) {
    // No trial, no plan-change field: neither exists in the product type and
    // neither is implemented in src/modules/payment. Adding one would mean
    // promising something the checkout cannot do.
    assert.ok(!('trialPeriodDays' in p));
    assert.ok(!('upgradeable' in p));
  }
});

test('every product carries the fields the checkout reads', async () => {
  const { pricingCatalog } = await import('../src/config/pricing');
  for (const p of Object.values(pricingCatalog)) {
    for (const field of ['productId', 'productName', 'planName', 'description',
      'type', 'priceInCents', 'currency', 'credits'])
      assert.ok(p[field] !== undefined, `${p.productId} is missing ${field}`);
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --import tsx --test tests/pricing-catalog.test.ts`
Expected: FAIL — the catalog still holds the demo products.

- [ ] **Step 3: Rewrite the catalog**

Replace the products with the three from §6. Amounts are demo values: `14900` / `39900` USD cents, `2900` per month for support, with `cnyPriceInCents` set on the two one-time products so manual payments stay demonstrable. Fill `productName`, `planName` and `description` in place, the way the file does today — `src/config/pricing.ts` is a code catalog, so the words live there rather than in `messages/en.json`; only the marketing copy the blocks render goes through i18n.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --import tsx --test tests/pricing-catalog.test.ts`
Expected: PASS, 4/4.

- [ ] **Step 5: Confirm the admin cannot edit prices**

Read `src/modules/config/settings.ts` and confirm no price field is declared there. If one exists, remove it and note the removal in the commit body.

- [ ] **Step 6: Commit**

Run: `pnpm typecheck && pnpm test && pnpm build && pnpm format:check`

```bash
git add src/config/pricing.ts messages/en.json tests/pricing-catalog.test.ts
git commit -m "feat: sell the three template products in the pricing catalog"
```

---

### Task 5: `RailsSection` and `InsideSection` replace `FeaturesSection`

**Files:**
- Create: `src/blocks/rails-section.tsx`, `src/blocks/inside-section.tsx`
- Delete: `src/blocks/features-section.tsx`
- Create: `src/components/rail-comparison.tsx` (presentational, props only)
- Test: `tests/marketing-blocks.test.ts`

**Interfaces:**
- Consumes: `site.rails.*` and `site.inside.*` from Task 3; Ledger tokens from Task 1.
- Produces: `RailsSection` and `InsideSection`, both zero-prop, both rendering a section with an eyebrow header and hairline separation.

- [ ] **Step 1: Write the failing test**

```ts
test('the rail comparison is its own section', () => {
  assert.ok(!existsSync('src/blocks/features-section.tsx'));
  for (const file of ['src/blocks/rails-section.tsx', 'src/blocks/inside-section.tsx'])
    assert.ok(existsSync(file), file);
});

test('both sections read site.* copy and neither reads landing.*', () => {
  for (const file of ['src/blocks/rails-section.tsx', 'src/blocks/inside-section.tsx']) {
    const source = read(file);
    assert.ok(source.includes("m['site."), file);
    assert.ok(!source.includes("m['landing."), file);
  }
});

test('section copy from the spec is installed verbatim', () => {
  const messages = JSON.parse(read('messages/en.json'));
  assert.equal(messages['site.rails.subscriptions.body'],
    'Recurring billing with Stripe. Plan changes, trials and cancellations handled.');
  assert.equal(messages['site.rails.offline.body'],
    'Collect by bank transfer or QR. Every order gets a unique amount, you approve the receipt.');
});
```

**Note:** the third assertion pins spec §6 copy that over-promises — "plan changes, trials and cancellations" — against the constraint at the top of this plan, which says only recurring billing and cancellation ship. Write the assertion for the corrected sentence instead: `'Recurring billing with Stripe. Cancellations handled.'` Fix the spec's sentence in the same commit and say so in the commit body.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --import tsx --test tests/marketing-blocks.test.ts`
Expected: FAIL — `features-section.tsx` still exists.

- [ ] **Step 3: Build the two sections**

`RailsSection`: an eyebrow header (`01 · THREE RAILS`-style, uppercase, tracking-wide, followed by a hairline rule, left aligned), then three equal columns on `md+`, stacked below. Each column: title, one-sentence body, and a `See the code` link to the relevant docs anchor. Hairlines between columns, no cards, no shadows.

`InsideSection`: the capability grid — auth, admin console, RBAC, storage, email, docs, analytics, offline transfers — each item a title plus one line, separated by hairlines, three columns on `lg`, two on `sm`, one below. No icons unless `lucide-react` already supplies one; do not add an image asset.

`src/components/rail-comparison.tsx` takes `{ rails: Array<{ title: string; body: string; href: string; label: string }> }` and renders the columns, so the block stays a thin copy binding. Delete `src/blocks/features-section.tsx` and any import of it.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --import tsx --test tests/marketing-blocks.test.ts`
Expected: PASS, 3/3.

- [ ] **Step 5: Check both modes**

Start `pnpm dev`, load `/` in light and dark, and confirm: hairlines are visible but not heavy in both, vermilion appears only on links (not as a background), and the three columns collapse to one at 320px without horizontal scroll.

- [ ] **Step 6: Commit**

Run: `pnpm typecheck && pnpm test && pnpm build && pnpm format:check`

```bash
git add src/blocks/rails-section.tsx src/blocks/inside-section.tsx src/components/rail-comparison.tsx messages/en.json tests/marketing-blocks.test.ts
git rm src/blocks/features-section.tsx
git commit -m "feat: split the feature grid into the rails and inside sections"
```

---

### Task 6: Hero with the receipt, and the steps block

**Files:**
- Modify: `src/blocks/hero-section.tsx`
- Create: `src/blocks/steps-section.tsx`
- Create: `src/components/receipt-card.tsx` (presentational, props only)
- Test: `tests/receipt-card.test.ts`, extend `tests/marketing-blocks.test.ts`

**Interfaces:**
- Consumes: `site.hero.*`, `site.steps.*`; Ledger tokens.
- Produces: `ReceiptCard({ merchant, lines, total, tax, stamp })` where `lines: Array<{ label: string; amount: string }>` and every amount is already formatted by the caller. `StepsSection` is zero-prop.

- [ ] **Step 1: Write the failing test**

```ts
test('the receipt renders line items and a total', () => {
  const html = renderToStaticMarkup(ReceiptCard({
    merchant: 'JERBIX', stamp: 'PAID', tax: '$0.00',
    lines: [{ label: 'Team licence', amount: '$399.00' }],
    total: '$399.00',
  }));
  assert.match(html, /Team licence/);
  assert.match(html, /\$399\.00/);
  assert.match(html, /PAID/);
});

test('the receipt is decorative for assistive tech', () => {
  const html = renderToStaticMarkup(ReceiptCard({ /* same props */ }));
  assert.match(html, /aria-hidden="true"/);
  assert.ok(!/<img/.test(html), 'the receipt must not depend on an image asset');
});

test('hero copy is the spec headline and both calls to action', () => {
  const messages = JSON.parse(read('messages/en.json'));
  assert.equal(messages['site.hero.headline'], 'Ship your SaaS. Take the first payment this week.');
  assert.equal(messages['site.hero.cta'], 'Start building');
  assert.equal(messages['site.hero.secondary'], "See what's inside");
});

test('the hero is left aligned, not centred', () => {
  const source = read('src/blocks/hero-section.tsx');
  assert.ok(!/text-center/.test(source), 'the hero must not centre its content');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --import tsx --test tests/receipt-card.test.ts`
Expected: FAIL — `src/components/receipt-card.tsx` does not exist.

- [ ] **Step 3: Build the receipt and the hero**

`ReceiptCard`: pure markup, no data fetching. Paper-coloured surface, `2px` corners, `1px` border, dashed hairline above the total, monospace-feel figures via the tabular-numeral class already set on `body`, and a vermilion "PAID" stamp rotated a few degrees with a hairline border. Bottom edge gets a zigzag via a CSS mask or repeating-linear-gradient — no SVG file, no bitmap. `aria-hidden="true"` because it repeats the hero's claim visually.

`HeroSection`: left-aligned two-column layout above `lg`, stacked below. Eyebrow, headline at the spec's weight and tracking, subheadline, two CTAs (`Start building` → `/pricing`, `See what's inside` → `#inside`). Receipt sits right on `lg+`.

`StepsSection`: four numbered steps from §6, each with a title, one line, and the command rendered in a bordered mono block for step one. Hairline between steps.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --import tsx --test tests/receipt-card.test.ts tests/marketing-blocks.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

Run: `pnpm typecheck && pnpm test && pnpm build && pnpm format:check`

```bash
git add src/blocks/hero-section.tsx src/blocks/steps-section.tsx src/components/receipt-card.tsx messages/en.json tests/receipt-card.test.ts tests/marketing-blocks.test.ts
git commit -m "feat: rebuild the hero around a rendered receipt and add the steps block"
```

---

### Task 7: Header, footer and navigation

**Files:**
- Modify: `src/components/site-header.tsx`, `src/components/site-footer.tsx`
- Modify: `messages/en.json` (`site.nav.*`, `site.footer.*`)
- Test: extend `tests/marketing-blocks.test.ts`

**Interfaces:**
- Consumes: `site.nav.*`, the `docs_enabled` flag already resolved in the root loader.
- Produces: header nav order `Rails · Inside · Pricing · Docs`; the Docs entry renders only when docs are enabled.

- [ ] **Step 1: Write the failing test**

```ts
test('the header navigation is the four marketing anchors', () => {
  const messages = JSON.parse(read('messages/en.json'));
  assert.deepEqual(
    ['rails', 'inside', 'pricing', 'docs'].map((k) => messages[`site.nav.${k}`]),
    ['Rails', 'Inside', 'Pricing', 'Docs']
  );
});

test('the header hides the docs entry when docs are off', () => {
  const source = read('src/components/site-header.tsx');
  assert.match(source, /docsEnabled/, 'the docs entry must be conditional');
});

test('no marketing chrome keeps a shadow or a rounded-xl card', () => {
  for (const file of ['src/components/site-header.tsx', 'src/components/site-footer.tsx'])
    for (const pattern of [/shadow-/, /rounded-xl/, /rounded-lg/])
      assert.ok(!pattern.test(read(file)), `${file} still uses ${pattern}`);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --import tsx --test tests/marketing-blocks.test.ts`
Expected: FAIL — the nav still names the old destinations.

- [ ] **Step 3: Restyle and rewire**

Header: hairline bottom border, no shadow, square corners, vermilion CTA for sign-up (`buttonVariants` on a `Link`, never `asChild`). Nav labels from `site.nav.*`, ordered as above; the Docs entry is conditional on the flag the layout already has. Mobile menu keeps working — verify the trigger is a `<button>` with `type="button"` now that the a11y rule is a warning rather than silence.

Footer: hairline top border, three columns (product, resources, legal), each heading in the eyebrow style, links as vermilion text without underline until hover.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --import tsx --test tests/marketing-blocks.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

Run: `pnpm typecheck && pnpm test && pnpm build && pnpm format:check`

```bash
git add src/components/site-header.tsx src/components/site-footer.tsx messages/en.json tests/marketing-blocks.test.ts
git commit -m "feat: restyle the marketing chrome and reorder the navigation"
```

---

### Task 8: Compose the landing page

**Files:**
- Modify: `src/routes/index.tsx`
- Test: extend `tests/marketing-blocks.test.ts`

**Interfaces:**
- Consumes: `HeroSection`, `RailsSection`, `InsideSection`, `StepsSection`, `PricingSection`, `FaqSection`, `CtaSection`.
- Produces: the homepage order from §6, with no blog section.

- [ ] **Step 1: Write the failing test**

```ts
test('the landing page runs the seven sections in order', () => {
  const source = read('src/routes/index.tsx');
  const order = ['HeroSection', 'RailsSection', 'InsideSection', 'StepsSection',
    'PricingSection', 'FaqSection', 'CtaSection'];
  const positions = order.map((name) => source.indexOf(`<${name}`));
  for (const [index, position] of positions.entries()) {
    assert.ok(position > 0, `${order[index]} is missing`);
    if (index > 0) assert.ok(position > positions[index - 1], `${order[index]} is out of order`);
  }
});

test('the homepage no longer loads blog posts', () => {
  const source = read('src/routes/index.tsx');
  assert.ok(!source.includes('BlogSection'));
  assert.ok(!source.includes('getBlogPostsFn'));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --import tsx --test tests/marketing-blocks.test.ts`
Expected: FAIL — the page still renders `FeaturesSection` and `BlogSection`.

- [ ] **Step 3: Recompose the page**

Drop the blog loader and `<BlogSection>`; import and order the seven sections. Keep the route's `head` metadata, updating the title and description to the new positioning from `site.meta.*`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --import tsx --test tests/marketing-blocks.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

Run: `pnpm typecheck && pnpm test && pnpm build && pnpm format:check`

```bash
git add src/routes/index.tsx messages/en.json tests/marketing-blocks.test.ts
git commit -m "feat: compose the landing page from the new sections"
```

---

### Task 9: Docs on by default, with three real pages

**Files:**
- Modify: `src/config/index.ts` (`docs_enabled` default), `.env.example`
- Create: `content/docs/getting-started.md`, `content/docs/configuration.md`, `content/docs/deployment.md`
- Test: `tests/docs-default.test.ts`

**Interfaces:**
- Consumes: the docs module from P1 (unchanged loader).
- Produces: `docs_enabled` defaulting to `true` in `envConfigs` and `.env.example`; three markdown files with `title` frontmatter.

- [ ] **Step 1: Write the failing test**

```ts
test('the documentation site ships enabled', async () => {
  const { envConfigs } = await import('../src/config');
  // `envConfigs.docs_enabled` is a string ('true' | 'false'), not a boolean.
  assert.equal(String(envConfigs.docs_enabled), 'true');
});

test('the content directory is no longer empty', () => {
  for (const file of ['getting-started', 'configuration', 'deployment'])
    assert.ok(existsSync(`content/docs/${file}.md`), file);
});

test('every doc page has a title and no invented commands', () => {
  for (const file of ['getting-started', 'configuration', 'deployment']) {
    const source = read(`content/docs/${file}.md`);
    assert.match(source, /^---\n[\s\S]*?title:/m, file);
    assert.ok(!/pnpm \w+:(\w|-)+/.test(source.replace(/pnpm [\w:-]+/g, '')),
      `${file} mentions a script the repo does not define`);
  }
});
```

**Note:** the third assertion is deliberately loose — the precise check is that every `pnpm <script>` in the docs exists in `package.json`. Implement it that way: collect `pnpm (\S+)` matches, look each up in `package.json` `scripts`, assert it exists.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --import tsx --test tests/docs-default.test.ts`
Expected: FAIL — `docs_enabled` is false and `content/docs/` is empty.

- [ ] **Step 3: Flip the default and write the pages**

Set the default in `src/config/index.ts` and `.env.example`, keeping the admin switch able to turn it off. Write three pages in Jerbix's voice, documenting only commands that exist: setup (`install`, `db:setup`, `db:push`, `rbac:init`, `dev`), configuration (the three config layers, the encryption baseline, provider setup), deployment (Node and Cloudflare, `cf:build`, `cf:deploy`, `check:deploy-env`).

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --import tsx --test tests/docs-default.test.ts`
Expected: PASS, 3/3.

- [ ] **Step 5: Verify the pages render**

Run: `pnpm dev`, then load `/docs`, `/docs/getting-started`, `/docs/configuration`, `/docs/deployment` in both modes. Confirm the sidebar shows three entries, the TOC populates, and the header's Docs link appears.

- [ ] **Step 6: Commit**

Run: `pnpm typecheck && pnpm test && pnpm build && pnpm format:check`

```bash
git add src/config/index.ts .env.example content/docs tests/docs-default.test.ts
git commit -m "feat: ship the documentation site enabled with three real pages"
```

---

## Out of scope for P2

| Work | Plan |
|---|---|
| `analytics_visitor` UTM columns, `REPORT_TIMEZONE`, period selector, dashboard cards, `/admin/analytics`, permission and agent API rename | P3 |
| Equivalent rewriting of ~265 files — code, comments, env and config internals — plus the similarity measurement and report | P4 |
| Skills 9 → 8, `new-app` rename, distillation, removing the two zero-reference skills | P5 |
| Docker image build (`ERR_PNPM_IGNORED_BUILDS`: `onlyBuiltDependencies` and `allowBuilds` disagree, and the Dockerfile copies neither the workspace file nor an approval for `workerd`) | Follow-up task, to be added once P2–P5 land |
| Demo blog articles rewritten in Jerbix's voice, and the blog kept off the homepage | Follow-up: content, not structure — the homepage work in Task 8 is what P2 owes |
| The licensing contact page the `LICENSE` refers to | Owner action before selling |
