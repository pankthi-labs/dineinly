---
name: dineinly-ui
description: Build or review Dineinly user interfaces, React components, CSS, layouts, and interaction states. Use for any visual, styling, responsive, accessibility, or frontend implementation work in the Dineinly repository.
---

# Dineinly UI

Read `AGENTS.md` and `docs/design-system.md` before making changes. Read `docs/product.md` for the affected workflow.

## Workflow

1. Identify the persona, screen, and state from `docs/product.md`; do not invent flows or permissions.
2. Implement semantic HTML and CSS with the existing design tokens only. Do not add a UI component library.
3. Keep the MVP dark-only and text-only. Do not add images, light mode, or values outside the design-system token reference.
4. Make guest and floor flows mobile-first; management is desktop-oriented.
5. Treat client permission checks as UX only. Server enforcement remains required.
6. Cover loading, empty, error, disabled, and realtime-updating states where relevant. Errors must explain the next action.

## Verification

Run the relevant formatter, typecheck, tests, and visual checks available in the repository. Re-read `docs/design-system.md` before finalizing token-sensitive changes.
