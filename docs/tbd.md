# TBD — Dineinly Counter Experience

Deferred items from Counter guest-experience discussion. Do not guess these — flag and ask before building.

## Resolved: Order More orphaned unreleased items

Was: tapping "Order More" after settling minted a brand-new tableless session, orphaning any unreleased items in the old one. Fixed by the Counter continuity re-architecture (`core-data-model.md` § Lifecycle invariants) — a Counter session now persists across the whole visit; "Order More" is a plain link back to `/guest/menu` on the *same* session, and ordering again just draws the next round's bill instead of starting a new session. Nothing is ever orphaned because there's no longer a session boundary between rounds.

## Partial release of a single order line

Release (`release_order_item_to_kitchen`) fires an entire order_item row — one line, one quantity, one tap. There's no way to send 5 of a qty-10 line now and the rest later; the guest has to have ordered them as two separate cart submissions up front to get that split.

Current workaround is sufficient for now (order in separate batches if you want staggered timing). Revisit if real usage shows guests wanting to split an already-placed line after the fact.
