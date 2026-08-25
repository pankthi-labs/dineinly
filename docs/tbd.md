# TBD — Dineinly Counter Experience

Deferred items from Counter guest-experience discussion. Do not guess these — flag and ask before building.

## Critical: Order More orphans unreleased items

`apps/web/app/guest/reorder/route.ts` mints a brand-new tableless session when the guest taps "Order More" after settling. Any order_item still un-released (`released_at IS NULL`) in the old, now-abandoned session has no guest-facing path back to it — only staff can release it manually from Bills.

Rejected fix: auto-release everything pending before minting the new session — user does not want food silently sent to the kitchen without an explicit guest tap.

Needs a real decision: e.g. block "Order More" until all pending items are released ("Send remaining N items first"), or some other guest-visible resolution. Revisit before shipping Order More broadly.

## Partial release of a single order line

Release (`release_order_item_to_kitchen`) fires an entire order_item row — one line, one quantity, one tap. There's no way to send 5 of a qty-10 line now and the rest later; the guest has to have ordered them as two separate cart submissions up front to get that split.

Current workaround is sufficient for now (order in separate batches if you want staggered timing). Revisit if real usage shows guests wanting to split an already-placed line after the fact.
