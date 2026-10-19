# Design System

> Source of truth: the design tokens live in **one** `:root` block in
> `public/styles.css` (search for `Design tokens — single source of truth`).
> Reference tokens (`var(--brand)`, `var(--slate-muted)`, …) instead of raw hex
> values in all new work.

---

## Brand direction

Lawn Craft pairs a **confident emerald green** (professional, healthy, outdoors)
with **warm earth/amber** accents and **neutral slate** surfaces. The look is
clean and intentional: generous whitespace, flat controls, subtle shadows, and
clear type hierarchy. It reads as credible for commercial/estate buyers while
staying approachable for homeowners.

---

## Color tokens

### Brand — emerald (primary)
| Token | Value | Use |
|---|---|---|
| `--brand` | `#15803d` | Primary actions, active nav, key accents |
| `--brand-dark` | `#166534` | Hover/pressed states, headings on light |
| `--brand-deep` | `#14532d` | Deep panels, gradients |
| `--brand-forest` | `#1a3a1a` | Hero overlays, dark gradients |
| `--brand-bright` | `#16a34a` | Secondary buttons, links |
| `--brand-glow` | `#22c55e` | Hover rings, highlights |
| `--brand-light` | `#f0fdf4` | Tinted section backgrounds |
| `--brand-soft` | `#dcfce7` | Chips, icon badges |
| `--brand-soft-2` | `#bbf7d0` | Borders on soft surfaces |
| `--brand-tint` | `#ecfdf5` | Subtle tint |
| `--brand-surface` | `#f4f6f4` | App background |

### Secondary — earth / amber
| Token | Value | Use |
|---|---|---|
| `--earth` | `#854d0e` | Warm accent text, tags |
| `--earth-dark` | `#78350f` | Warm hover |
| `--earth-deep` | `#9a3412` | Warm emphasis |
| `--earth-bright` | `#facc15` | Stars, highlights |
| `--earth-soft` | `#fde68a` | Warm chips |
| `--earth-tint` | `#fef3c7` | Warm tint |
| `--earth-tint-2` | `#fffbeb` | Warmest tint |

### Neutrals — slate
| Token | Value | Use |
|---|---|---|
| `--ink` / `--slate-text` | `#0f172a` | Primary text, headings |
| `--ink-2` | `#1e293b` | Dark surfaces, footer |
| `--slate-strong` | `#334155` | Strong body text |
| `--slate-soft` | `#475569` | Body text |
| `--slate-muted` | `#64748b` | Muted/secondary text |
| `--slate-faint` | `#94a3b8` | Placeholders, meta |
| `--slate-border` | `#e2e8f0` | Default borders |
| `--slate-border-strong` | `#cbd5e1` | Stronger dividers |
| `--surface` | `#ffffff` | Cards, headers |
| `--surface-2` | `#f8fafc` | Page background |
| `--surface-3` | `#f1f5f9` | Inset panels |

### Semantic
- `--danger` `#dc2626`, `--danger-strong` `#b91c1c`
- `--success` `#16a34a`, `--warning` `#facc15`

---

## Scales

**Radius** — `--radius-sm: 8px`, `--radius-md: 12px`, `--radius-lg: 16px`,
`--radius-xl: 22px`, `--radius-pill: 999px`.

**Shadow** — `--shadow-sm`, `--shadow-md`, `--shadow-lg` (subtle, slate-tinted).

**Motion** — `--dur-fast: 0.15s`, `--dur: 0.3s`, `--dur-slow: 0.5s`,
`--ease-out: cubic-bezier(0.2, 0.7, 0.3, 1)`. Always honor
`prefers-reduced-motion` (see bottom of `styles.css`).

---

## Typography

- **Family**: Lato — fallback `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
- **Hero title**: `clamp(2.5rem, 8vw, 4.5rem)`, weight `900`, letter-spacing `-0.02em`
- **Section title**: `clamp(1.8rem, 5vw, 3.2rem)`, weight `900`
- **Body**: `0.95rem`, weight `400–500`, line-height `1.7–1.9`

---

## Components

- **Buttons**: flat (no radius on primary CTA style), `--brand` fill or outlined;
  hologram-free, minimal shadow, gentle `translateY(-2px)` on hover.
- **Cards**: 1px `--slate-border`, `--radius-lg`, `--shadow-sm` → `--shadow-md`
  on hover.
- **Service cards**: 4px left `--brand` bar, oversized translucent step number.
- **Header**: 80px sticky, `.socials` hidden ≤1420px, action cluster collapses
  to icons ≤1420px, primary quote CTA becomes an icon ≤900px, nav collapses
  into the ☰ directory ≤1180px.
- **Footer**: `--ink-2` background, `--brand-bright` tagline.

---

## Layout & responsive

- Container max-width `1360px`, padding `0 36px` (`0 20px` on mobile).
- Breakpoints: `1420` (compact header), `1180` (hamburger), `1024` (2→1 col),
  `968`, `900`, `768` (mobile), `640`.
- Mobile-first, container queries preferred for **new** components; avoid adding
  to the 25 existing media queries.

---

## Accessibility

1. `:focus-visible` outline (2px, 2px offset) on all interactive elements.
2. Skip-to-content link.
3. ARIA labels on icon-only controls (header actions already do this).
4. Heading hierarchy h1→h4.
5. Contrast: use `--brand` (`#15803d`) for text on white; **do not** use
   `--brand-glow` `#22c55e` for text on white (fails AA) — reserve it for
   fills/indicators.
6. Honor `prefers-reduced-motion`.

---

## Editing

Pages are generated from `src/pages/*` + `src/partials/*`. See README →
"Editing pages". After editing shared layout run:

```bash
npm run build:pages          # regenerate public/*.html
npm run build:pages:check    # CI staleness guard
```
