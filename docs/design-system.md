# Design System

> Canonical design system for this repo. All AI coding agents must use only the tokens and rules defined here.
>
> **Hard rule: never introduce a color, font, spacing value, border radius, duration, or easing curve that is not listed in this document — even if it looks visually reasonable.** If a new value seems needed, stop and flag it instead of inventing one.

---

# 01 — Full CSS Token Reference

Copy-paste source of truth. Load into `globals.css`.

```css
:root {
  /* Foundation */
  --color-bg-base: #0B1018;
  --color-surface-1: #121821;
  --color-surface-2: #1A212C;
  --color-surface-3: #222A36;
  --color-divider: #1A2030;

  /* Text — WCAG AA */
  --color-text-primary: #E7EAEE;   /* 15.8:1 */
  --color-text-secondary: #A8ADB5; /* 7.1:1 */
  --color-text-muted: #858D97;     /* 4.6:1 */
  --color-text-disabled: #606672;  /* 3.1:1 — text-xl (20px) and above only */

  /* Accent */
  --color-accent-primary: #D6B36A;  /* Champagne Gold — MAX 12% of any screen */
  --color-accent-hover: #E3C589;    /* Soft Gold Light — hover only */
  --color-accent-secondary: #C88A75;/* Rose Copper */
  --color-accent-support: #C9874A;  /* Soft Amber */

  /* State */
  --color-state-success: #4FAF85;
  --color-state-warning: #D89A52;
  --color-state-error: #D46A6A;
  --color-state-info: #7F98AC;

  /* Glass / Glow */
  --color-glass-bg: rgba(20,24,32,0.72);
  --color-glass-border: rgba(255,255,255,0.07);
  --glow-gold: rgba(214,179,106,0.16);
  --glow-copper: rgba(200,138,117,0.10);
  --glow-blue: rgba(143,168,186,0.08);
  --blur-glass: var(--space-4); /* 16px — glass backdrop blur, reuses spacing scale */

  /* Typography */
  --font-display: 'Outfit', system-ui, sans-serif;
  --font-ui: 'Inter', system-ui, sans-serif;
  --font-mono: ui-monospace, monospace; /* generic fallback stack, not a third brand typeface */

  /* Spacing — 8px grid */
  --space-px: 1px; --space-0_5: 2px; --space-1: 4px;
  --space-2: 8px; --space-3: 12px; --space-4: 16px;
  --space-5: 20px; --space-6: 24px; --space-8: 32px;
  --space-10: 40px; --space-12: 48px; --space-16: 64px;
  --space-24: 96px;

  /* Border Radius */
  --radius-none: 0; --radius-xs: 2px; --radius-sm: 4px;
  --radius-md: 8px; --radius-lg: 12px; --radius-xl: 16px;
  --radius-2xl: 24px; --radius-3xl: 32px;
  --radius-pill: 9999px; --radius-full: 50%;

  /* Duration */
  --duration-instant: 0ms; --duration-fast: 100ms;
  --duration-base: 200ms; --duration-slow: 300ms;
  --duration-deliberate: 500ms; --duration-cinematic: 700ms;
  --duration-exit-fast: 150ms; --duration-skeleton: 1500ms;

  /* Easing */
  --ease-out: cubic-bezier(0.0, 0.0, 0.2, 1);
  --ease-in: cubic-bezier(0.4, 0.0, 1.0, 1);
  --ease-in-out: cubic-bezier(0.4, 0.0, 0.2, 1);
  --ease-emphasized: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-linear: linear;

  /* Breakpoints — mobile-first, min-width. NOT usable in var(); see §10. */
  --breakpoint-sm: 480px;
  --breakpoint-md: 768px;
  --breakpoint-lg: 1024px;
  --breakpoint-xl: 1280px;

  /* Icon sizes — see §11 */
  --icon-xs: 14px; --icon-sm: 16px; --icon-md: 20px;
  --icon-lg: 24px; --icon-xl: 32px;
  --icon-stroke: 1.5;

  /* Shadow — see §12 */
  --shadow-none: none;
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.24);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.32);
  --shadow-lg: 0 12px 32px rgba(0,0,0,0.40);

  /* Z-Index — see §13 */
  --z-base: 0; --z-sticky: 10; --z-dropdown: 20;
  --z-overlay: 30; --z-modal: 40; --z-toast: 50; --z-tooltip: 60;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

No arbitrary px, hex, or timing values in component code. Only these tokens.

---

# 02 — Typography

Fonts: **Outfit** (display) + **Inter** (UI). Load both via `next/font`. Never fall back to `system-ui` in production. No other font may be introduced.

| Step | px | Weight | Line-H | Letter-spacing | Font | Usage |
|---|---|---|---|---|---|---|
| text-xs | 12px | w500 min | 1.40 | 0.025em | Inter | Labels, timestamps |
| text-sm | 14px | w400 | 1.45 | 0.010em | Inter | Captions, helper text |
| text-base | 16px | w400 | 1.50 | 0em | Inter | Body text |
| text-lg | 18px | w500 | 1.45 | 0em | Inter | Card sub-headings |
| text-xl | 20px | w600 | 1.35 | -0.01em | Inter | Section labels |
| text-2xl | 24px | w700 | 1.30 | -0.02em | Inter | Page sub-headings |
| text-3xl | 30px | w700 | 1.25 | -0.02em | Outfit | Page headings — Outfit starts here |
| text-4xl | 36px | w700 | 1.20 | -0.03em | Outfit | Hero / screen titles |
| text-5xl | 48px | w700 | 1.10 | -0.04em | Outfit | Marketing / onboarding |
| text-6xl | 60px | w300 | 1.05 | -0.04em | Outfit | Splash / cover display |

**Rules (non-negotiable):**
- Outfit only at `text-3xl` and above. Never Outfit for body text — readability breaks below that size.
- `text-xs` must be **w500 minimum**, or bump color to `--color-text-secondary`. Raw w400 at 12px fails on OLED.
- ALL CAPS labels: `text-xs` (12px), **w600 minimum**, letter-spacing **0.08em** (pinned point in the 0.08–0.10em range — `.text-caps` utility), uppercase, Inter only. Never Outfit for all-caps.
- Max line length: **68ch** (pinned point in the 60–72ch range — `.prose` utility). Never full-bleed body text.
- Minimum tap-target text size: `text-sm` (14px) for any interactive label.
- Outfit + Inter only for typographic text. `--font-mono` (`ui-monospace, monospace`) is a generic system fallback stack for `code`/`kbd`/`pre`/`samp`, not a third brand typeface — it introduces no named font.
- Links: underline at rest in `--color-divider`, strengthening to `currentColor` on hover, offset `--space-0_5`. No color change on hover — `--color-accent-hover` is reserved for gold buttons/inputs only (§06).

---

# 03 — Spacing

8px base grid. No arbitrary pixel values in component code — always use a `--space-*` token.

| Token | px | Usage |
|---|---|---|
| `--space-px` | 1px | Hairline dividers only |
| `--space-0_5` | 2px | Icon-to-label micro gap |
| `--space-1` | 4px | Tight chip/badge padding |
| `--space-2` | 8px | Small inner padding |
| `--space-3` | 12px | Label-to-content gap |
| `--space-4` | 16px | Standard inner padding |
| `--space-5` | 20px | Card internal gap / screen margin |
| `--space-6` | 24px | Button H-padding / bottom sheet |
| `--space-8` | 32px | Between-card gap |
| `--space-10` | 40px | Hero content spacing |
| `--space-12` | 48px | Section gap |
| `--space-16` | 64px | Page breathing room |
| `--space-24` | 96px | Hero / splash breathing room |

---

# 04 — Border Radius

One radius per surface level. Never mix radii within a single card.

| Token | px | Usage |
|---|---|---|
| `--radius-none` | 0 | Data tables, ruled lines, dividers |
| `--radius-xs` | 2px | Tags, micro-chips, inner badge elements |
| `--radius-sm` | 4px | Input fields, small buttons, tooltips |
| `--radius-md` | 8px | Standard buttons — **primary CTA only** |
| `--radius-lg` | 12px | Menu item cards, thumbnail containers |
| `--radius-xl` | 16px | Main content cards, dish cards |
| `--radius-2xl` | 24px | Featured hero cards, highlighted sections |
| `--radius-3xl` | 32px | Full-screen overlays, onboarding panels |
| `--radius-pill` | 9999px | Toggle pills, time chips, quantity selectors |
| `--radius-full` | 50% | Avatars, profile images, icon containers |

---

# 05 — Motion & Animation

Cinematic and restrained. Motion communicates state, not decoration.

**Component motion reference:**

| Component | Action | Duration | Easing | Notes |
|---|---|---|---|---|
| Button | Hover | 200ms | ease-out | Color only — no transform |
| Button | Press | 100ms | ease-in | Scale 0.97 |
| Modal | Open | 500ms | ease-out | Slide up + fade in |
| Modal | Close | 150ms | ease-in | Always faster than open |
| Bottom Sheet | Open | 500ms | ease-emphasized | Strong deceleration, no overshoot — tactile luxury feel |
| Bottom Sheet | Close | 200ms | ease-in | Faster than open, no overshoot |
| Toast | Enter | 300ms | ease-out | Slide in from top |
| Toast | Exit | 150ms | ease-in | Fade only |
| Page | Transition | 500ms | ease-in-out | Crossfade or slide |
| Card list | Entry | 300ms | ease-out | Stagger 40ms · max 3 items · 120ms total |
| Skeleton | Shimmer | 1500ms | ease-in-out | Infinite loop |

**Skeleton shimmer implementation** — built from existing surface tokens, no new color introduced:

```css
.skeleton {
  background: linear-gradient(90deg,
    var(--color-surface-1) 25%, var(--color-surface-2) 50%, var(--color-surface-1) 75%);
  background-size: 200% 100%;
  animation: skeleton-shimmer var(--duration-skeleton) var(--ease-in-out) infinite;
}
@keyframes skeleton-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
```

**Rules (non-negotiable):**
- Exit is always faster than entry — 30–40% of entry duration.
- `--ease-emphasized` is **forbidden** on settlement confirmation and error states.
- Stagger cap: max 3 visible items, 40ms each, 120ms total. No animation for items beyond the fold.
- Max 2 animated elements on screen simultaneously.
- Never animate `width`/`height` in scroll views — opacity + transform only.
- `prefers-reduced-motion: reduce` must drop all transitions to ~0ms.

---

# 06 — Semantic Token Disambiguation

Four accent tokens, four distinct roles. Do not substitute one for another.

**`--color-accent-primary` (Champagne Gold)**
- Use for: primary CTA (Send to Kitchen / Request Bill / Settle), price highlights & totals, active tab/nav indicator, filled star ratings.
- Never for: body text, more than 12% of any screen, error/warning context, decorative borders.

**`--color-accent-secondary` (Rose Copper)**
- Use for: order/settlement confirmation checkmarks, completed-step indicators, ghost button hover, "Chef's Pick"/featured tags.
- Never for: primary CTA (use Gold), progress bars (use Amber), warning states, navigation/tab bar.

**`--color-accent-support` (Soft Amber)**
- Use for: multi-step progress bars, step indicators, table occupancy gauge, countdown timers.
- Never for: CTAs, confirmation states, background fills, text labels (contrast risk).

**`--color-accent-hover` (Soft Gold Light)**
- Use for: gold button hover state only, active gold icon illumination, focus ring on gold-bordered inputs.
- Never for: standalone use, text color, borders, or card backgrounds.

---

# 07 — Images

**No images in the MVP** — text-only menus and cards. Image treatment is post-MVP.

---

# 08 — Domain Vocabulary

Use Dineinly domain terms only. Nothing may imply reservation or payment functionality.

- **Approved:** Add to Cart, Confirm Order, Send to Kitchen, Preparing, Ready, Served, Request Bill, Generate Bill, Mark Bill Settled.
- **Excluded:** Reservations, Bookings, Payment/Checkout flows and states.

---

# 09 — Non-Negotiable Constraints

Deviations require explicit written sign-off — never implement speculatively.

- **Dark-only** in the MVP; no light mode. Wordmark ships as one asset, `apps/web/public/brand/dineinly-logo-dark.svg` — no light-mode variant to maintain.
- **No component library** — semantic HTML/CSS with these tokens only.
- **No values beyond this document.** The four accents are exhaustive — never a fifth. Breakpoints (§10), icons (§11), shadow (§12), and z-index (§13) define the only allowed values for those — never invent a value outside them.
- Gold (`--color-accent-primary`) stays under 12% of any screen.
- Text tokens keep their documented WCAG AA contrast ratios.
- Glass/glow tokens only as documented — no new glass surfaces.
- Stagger cap 3 items / 120ms total; motion exit always faster than entry.

---

# 10 — Breakpoints

Mobile-first, **min-width only**. Base styles (no media query) are the phone layout — every query scales *up* from there. `max-width` queries are forbidden; they invert the cascade and cause override bugs.

| Token | px | Primary audience |
|---|---|---|
| `--breakpoint-sm` | 480px | Large phone |
| `--breakpoint-md` | 768px | Tablet portrait — floor & kitchen stations |
| `--breakpoint-lg` | 1024px | Tablet landscape / laptop — manager |
| `--breakpoint-xl` | 1280px | Desktop — owner / admin back office |

**Mechanism.** CSS `var()` cannot be referenced inside an `@media` condition, so these are not consumed directly. Use PostCSS `@custom-media` (see `tech-stack.md`), defined once in `globals.css`:

```css
@custom-media --bp-sm (min-width: 480px);
@custom-media --bp-md (min-width: 768px);
@custom-media --bp-lg (min-width: 1024px);
@custom-media --bp-xl (min-width: 1280px);
```

Usage in components:

```css
@media (--bp-md) {
  .grid { grid-template-columns: 1fr 1fr; }
}
```

**Rules:**
- These 4 values are the only allowed viewport breakpoints. No arbitrary media-query numbers.
- Mobile-first always: write the phone layout first, add `min-width` overrides after.
- For component-internal responsiveness (a card that reflows regardless of viewport), use native `@container` — zero token, no dependency, not a viewport breakpoint.
- Guest-facing ordering flows are phone-first and may never assume anything above `--breakpoint-sm`. Staff/back-office surfaces are the ones that climb to `md`/`lg`/`xl`.

---

# 11 — Icons

**Set: Lucide** (`lucide-react`) — ISC license, free and open-source. Tree-shakeable, SVG, no runtime dependency. Sanctioned choice — do not introduce a second icon set.

**Rules:**
- **Stroke:** `--icon-stroke` (1.5) — not Lucide's 2px default. Thinner stroke reads elegant and restrained rather than bold/decorative.
- **Size:** use `--icon-*` tokens only, never a raw px value. Default inline icon is `--icon-md` (20px); nav/status icons use `--icon-lg` (24px).
- **Color:** `currentColor`, inheriting the surrounding text token. Gold (`--color-accent-primary`) only on active/selected state, per §06 — never a standalone icon-only accent.
- **Weight/variant:** outline stroke only. No filled, duotone, or multicolor variants in the MVP — those read as decorative, not premium.
- **Tap target:** any interactive icon sits inside a minimum 44px wrapper regardless of glyph size.
- **Restraint:** one icon per action or status, never doubled up. An icon clarifies meaning already conveyed by text — it does not replace text, and it does not decorate.

---

# 12 — Shadow

Four levels, black-only, dark-calibrated. Surface tone (`--color-surface-1/2/3`) is the primary elevation cue — shadow is a secondary lift, used only where a surface floats above the layout rather than sitting flush in it.

| Token | Value | Usage |
|---|---|---|
| `--shadow-none` | `none` | Flush surfaces: menu/dish cards, list rows. Surface-2/3 background alone signals elevation — never add shadow here, it reads decorative. |
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.24)` | Tooltip, dropdown/select menu — the smallest float. |
| `--shadow-md` | `0 4px 12px rgba(0,0,0,0.32)` | Toast, popover. |
| `--shadow-lg` | `0 12px 32px rgba(0,0,0,0.40)` | Modal, bottom sheet — the highest float in the MVP. |

**Rules:**
- Black only, opacity-based — no colored shadows, no glow-as-shadow. Glow tokens (`--glow-gold`/`--glow-copper`/`--glow-blue`, §01) are a separate accent-illumination effect, never a substitute for elevation.
- Pair every non-`none` shadow with `--color-glass-border` on the element's edge — on a near-black background, shadow alone under-defines the boundary; the hairline border does the rest.
- No arbitrary blur/spread/opacity values in component code — only these four tokens.
- Cards stay flat (`--shadow-none`) by default. Reach for a shadow only when the element visually floats above the page (menus, sheets, toasts, modals) — never as card decoration.

---

# 13 — Z-Index

Seven semantic layers, lowest to highest. Components reference the token, never a raw number.

| Token | Value | Layer |
|---|---|---|
| `--z-base` | 0 | Default document flow. |
| `--z-sticky` | 10 | Sticky nav/header, sticky filter bars. |
| `--z-dropdown` | 20 | Dropdown/select menus. |
| `--z-overlay` | 30 | Modal/bottom-sheet backdrop scrim. |
| `--z-modal` | 40 | Modal and bottom sheet content. |
| `--z-toast` | 50 | Toast/snackbar — above modal, so a confirmation or error is never hidden behind one. |
| `--z-tooltip` | 60 | Tooltip — always topmost; must never be obscured by anything else on screen. |

**Rules:**
- No raw `z-index` numbers in component code — only these tokens.
- Gaps of 10 between layers exist so a future layer can slot in without renumbering the rest; never invent an intermediate value yourself — stop and ask if one seems needed.
- Each stacking context starts fresh at `--z-base`; these tokens order layers *within* a context, not across unrelated ones.
