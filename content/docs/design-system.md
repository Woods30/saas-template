---
title: Design System
description: Color, font, and scale tokens, plus where to put your own logo
locale: en
order: 24
group: develop
updated: 2026-11-03
---

Every color, size, radius, and shadow on the site traces back to this page. **The code is
the source of truth**: values live in `src/styles/globals.css`, and the repo-root `DESIGN.md`
has the fuller rules; when they disagree, trust the CSS.

## Color

Use semantic tokens only. **Never write raw color scales** — `bg-zinc-100`, `text-gray-500`,
`bg-white`, and `#6B46FF` are all disallowed. For neutrals, use derived forms like
`bg-foreground/10`.

| Token | Purpose | Note |
|---|---|---|
| `--background` / `--foreground` | Page / body text | Contrast 18.01 / 17.39 |
| `--card` / `--popover` | Raised surfaces | One step above background |
| `--primary` / `--primary-foreground` | Brand, links, selection / text on brand | Dark theme foreground is **ink**, not white |
| `--secondary` | Secondary surface | Carries purple, **small areas only** |
| `--muted` / `--muted-foreground` | Large section backgrounds / secondary text | Near-neutral cool gray |
| `--accent` | Menu hover, selected background | A **surface**, not an accent color — don't draw dots with it |
| `--highlight` | Decorative dots, rails, connectors | Same hue, one step lighter; ≥ 3:1 for non-text graphics |
| `--destructive` / `--success` / `--warning` | Status semantics | Text and icon color only |
| `--border` / `--input` / `--ring` | Dividers / form borders / focus ring | `--input` is **darker than border** to reach 3:1 |
| `--sidebar` and `--sidebar-*` | Sidebar | `--sidebar` matches `--background`, separated by `--sidebar-border` |
| `--chart-1..5` | Default chart series | Data visualization only |

`tests/unit/theme-consistency.test.ts` scans `src/` (excluding `ui/` and `mail/`) and fails
on color literals — new exceptions need a documented reason in the test.

Minimal example:

```tsx
<div className="bg-background text-foreground">
  <div className="bg-card text-card-foreground rounded-xl border border-border p-6">
    <p className="text-muted-foreground">Secondary note</p>
    <button className="bg-primary text-primary-foreground rounded-md px-4 py-2">
      Primary action
    </button>
  </div>
</div>
```

## Typography

| Token | Value | Notes |
|---|---|---|
| `--font-sans` | Inter Variable → Quicksand Variable → system stack | Body |
| `--font-mono` | JetBrains Mono Variable → system mono | Code |
| `--font-display` | Quicksand Variable → Inter Variable | Brand wordmark |
| `--tracking-normal` | `-0.01em` | Pairs with Inter |

Fonts are self-hosted via `@fontsource-variable/*`, **not Google Fonts** — so CSP `font-src`
needs no third-party origin and there is no render-blocking external request.

None of the three fonts include CJK glyphs. Keep the `PingFang SC` / `Microsoft YaHei`
fallback in `--font-sans` or Chinese text falls back to the browser default.

## Scale

| Dimension | Value |
|---|---|
| `--radius` | `0.75rem` (`sm`/`md` minus 4/2px, `xl` plus 4px) |
| Card radius | `rounded-xl` |
| Table frame | `rounded-lg` |
| `--card-spacing` | `1.5rem` |
| `--shadow-2xs..2xl` | Eight steps; light theme tints with brand purple |

**Shadows must be written per theme, not wrapped in `light-dark()`.** It only resolves in a
color context; `box-shadow` treats it as an unknown value and you get `box-shadow: none`.

## Changing the theme colors

1. Pull real values from the registry, not the CSS pasted on the website:

   ```bash
   curl -sL https://tweakcn.com/r/themes/<id>
   ```

2. Check contrast pair by pair (body ≥ 4.5:1, non-text ≥ 3:1) and apply the correction
   table in `DESIGN.md`.
3. Declare new tokens in **both** `:root` and `@theme inline`; declaring only one leaves a
   value empty in one theme.
4. Sync four places: `ui.themeColor` in `src/config/website.ts`, `public/manifest.json`,
   `EMAIL_THEME` in `src/core/email/components/EmailLayout.tsx`, and the examples in
   `content/docs/configuration*.md`.
5. Run `pnpm test` — `theme-colors.test.ts` and `theme-tokens.test.ts` guard against drift.

## Replacing the brand logo

The logo has two parts: a **graphic mark** and the **site name**.

- The mark is a static SVG in `src/components/layout/brand/`. `BrandLogo.tsx` imports it as
  text with `?raw`, strips the asset's own `<style>`, and injects it. **Keep the variable
  names and class names that the SVG's `<style>` block declares** — `BrandLogo.tsx` maps
  those class names onto CSS variables, and renaming them breaks the mapping.
- The site name is **text**, taken from `metadata.name` in `src/config/website.ts` and
  rendered with `--font-display`. The wordmark is deliberately not baked into the SVG.

| What to change | Where |
|---|---|
| Graphic mark | The SVG under `src/components/layout/brand/` |
| Site name | `metadata.name` in `src/config/website.ts` |
| Two-tone wordmark accent suffix | `metadata.logoAccent` in `src/config/website.ts` (leave empty if none) |
| Share image and icons | `metadata.images` in `src/config/website.ts` |
| Browser address bar color | `ui.themeColor` in `src/config/website.ts` |

The logo is **inline SVG, not `<img>`**: CSS variables cannot cross the `<img>` document
boundary, so with `<img src>` theme switching has no effect on it. **Never derive a dark
logo with CSS filters** — `invert` / `hue-rotate` are global color matrices and cannot map
the ink and the brand purple correctly at the same time.
