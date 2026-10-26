---
title: Design System
description: Colors, typography, scale, dashboard layout, and the brand logo
locale: en
order: 20
group: develop
updated: 2026-10-21
---

Every color, size, radius, and shadow on the site should trace back to this page. **The
code is the source of truth**: values live in `src/styles/globals.css`, and the repo-root
`DESIGN.md` has the fuller version. When they disagree, trust the CSS.

## Principles

1. **Purple only where it matters.** Primary, links, selected states, small menu surfaces.
   Body text, code blocks, and borders stay neutral. Purple across a whole layout turns the
   page lavender.
2. **Three layers of depth.** Light: page background off-white < card white. Dark: page
   background darkest < card lifted one step. The sidebar shares the background color and
   is separated by a 1px border.
3. **Template first.** Every visual decision goes through semantic tokens so downstream
   users can re-skin by changing one place.

## Setup

### Color

Use semantic tokens only. **Never write raw color scales** — `bg-zinc-100`, `text-gray-500`,
`bg-white`, or `#6B46FF` are all disallowed. For neutrals, use derived forms like
`bg-foreground/10`.

| Token | Purpose | Note |
|---|---|---|
| `--background` / `--foreground` | Page / body text | Contrast 18.01 / 17.39 |
| `--card` / `--popover` | Raised surfaces | One step above background |
| `--primary` | Brand, links, selection | Dark theme foreground is **ink**, not white |
| `--secondary` | Secondary surface | Carries purple, **small areas only** |
| `--muted` | Large section backgrounds | Near-neutral cool gray |
| `--muted-foreground` | Secondary text | Contrast 6.13 / 6.29 |
| `--accent` | Menu hover, selected background | A **surface**, not an accent color |
| `--highlight` | Decorative dots, rails, connectors | Same hue, one step lighter |
| `--destructive` / `--success` / `--warning` | Status semantics | Text and icon color only |
| `--border` | Dividers | Neutral |
| `--input` | Form borders | **Darker than border** to reach 3:1 |
| `--sidebar` | Sidebar background | **Same as background** |
| `--chart-1..5` | Default chart series | Data visualization only |

> Two tests enforce this: `tests/unit/theme-consistency.test.ts` scans `src/` (excluding
> `ui/` and `mail/`) and fails on color literals. New exceptions need a documented reason.

### Typography

| Token | Value | Notes |
|---|---|---|
| `--font-sans` | Inter Variable → Quicksand → system stack | Body |
| `--font-mono` | JetBrains Mono Variable → system mono | Code |
| `--tracking-normal` | `-0.01em` | Pairs with Inter |

Fonts are self-hosted via `@fontsource-variable/*`, **not Google Fonts** — so CSP
`font-src` needs no third-party origin and there is no render-blocking external request.

> None of the three fonts include CJK glyphs. Keep `PingFang SC` / `Microsoft YaHei` in the
> `--font-sans` fallback stack or Chinese text falls back to the browser default.

### Scale

| Dimension | Value |
|---|---|
| `--radius` | `0.75rem` (`sm`/`md` minus 4/2px, `xl` plus 4px) |
| Card radius | `rounded-xl` |
| Table frame | `rounded-lg` |
| `--shadow-2xs..2xl` | Eight steps; light theme tints with brand purple |
| `--card-spacing` | `1.5rem` |

> **Shadows must be written per theme, not with `light-dark()`.** It only resolves in a
> color context; `box-shadow` treats it as an unknown value and you get
> `box-shadow: none`.

### Changing the theme

1. Pull real values from the registry, not the CSS pasted on the website:

   ```bash
   curl -sL https://tweakcn.com/r/themes/<id>
   ```

2. Check contrast pair by pair (body ≥ 4.5:1, non-text ≥ 3:1) and apply the correction
   table in `DESIGN.md`.
3. Declare new tokens in **both** `:root` and `@theme inline`; declaring only one leaves a
   value empty in one theme.
4. Sync four places: `ui.themeColor` in `website.ts`, `public/manifest.json`, `EMAIL_THEME`
   in `src/mail/components/EmailLayout.tsx`, and the examples in `content/docs/configuration*.md`.
5. Run `pnpm test` — `theme-colors.test.ts` guards against drift.

## Dashboard layout

`DashboardLayout` uses shadcn's `sidebar` + `SidebarInset`, with `variant="inset"`.

- **Keep `inset`**: the content area is a floating panel (`m-2` + `rounded-xl` +
  `shadow-sm`) and the boundary reads from `shadow-sm` plus the header hairline. This theme
  gives `--sidebar` and `--background` the same value — do not conclude "inset is
  invisible" and switch back to the default variant.
- **Content width is `max-w-6xl`**: the dashboard has both single-column forms and 5–6
  column tables; a narrower column crushes the table.
- **`SidebarInset` needs `min-w-0`**: as a flex item its default `min-width: auto` lets a
  wide table's min-content push it past the viewport, causing horizontal page scroll.
- **Tables drop secondary columns at breakpoints** (`hidden sm:table-cell`); do not rely on
  horizontal scrolling — the scroll area pushes primary actions off screen. Move row
  actions into a `DropdownMenu` when there are many.
- **Do not put table frames at call sites**: `globals.css` supplies them through
  `[data-slot='table-container']` and `[data-slot='table-header']`. Never wrap a table page
  in another `Card` — that produces a frame inside a frame.
- **Do not write `p-6` per card**: `ui/card` hardcodes `--card-spacing` in its utility
  classes; `globals.css` raises it to 24px globally.
- **Theme switching lives in the user menu**, alongside "Account settings / Sign out".
  Below `md` the sidebar is a drawer, so the header gets its own `ThemeToggle`.
- **The user menu opens from the sidebar's right edge**: `side={isMobile ? 'bottom' : 'right'}`
  + `align="end"`. Opening upward covered too much of the content area.

## Brand logo

The logo is **inline SVG, not `<img>`**. CSS variables cannot cross the `<img>` document
boundary, so theme switching would have no effect on it.

- `BrandLogo` imports the SVG as text with `?raw`, strips the asset's own `<style>` (it
  carries `:root{--jbx-*}` defaults that would override site tokens), rewrites classes into
  presentation attributes, then injects it.
- `--jbx-*` uses **brand-spec colors**, not site tokens: ink `#111318`, brand purple
  `#6948FF`. The site's light `--primary` is also `#6948FF`, so they agree by construction.
- **Never derive a dark logo with CSS filters.** `invert` / `hue-rotate` are global color
  matrices and cannot map the ink and the purple correctly at the same time.
- **The two hero mascot bitmaps must share dimensions and composition**, switched by
  `.leap-mascot-on-dark`. Switch with `visibility`, not `display` — the latter collapses
  the parent's height.

**Replacing it with your own brand**:

1. Put the SVG in `src/components/layout/brand/`, keeping the `--jbx-*` variable names;
2. Update `metadata.images` in `src/config/website.ts`;
3. If your brand color is far from purple, re-derive `--primary` and friends following
   "Changing the theme" above.

## References

- [shadcn/ui · Theming](https://ui.shadcn.com/docs/theming)
- [Tailwind CSS v4 · Theme variables](https://tailwindcss.com/docs/theme)

## Next steps

- [Project Structure](./project-structure) — which file to edit
- [Forms](./forms) — the standard form pattern
- [Website Config](./configuration) — `metadata.images` and `ui.themeColor`
