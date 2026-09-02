# TBD — Dineinly Counter Experience

Deferred items from Counter guest-experience discussion. Do not guess these — flag and ask before building.

## Resolved: Order More orphaned unreleased items

Was: tapping "Order More" after settling minted a brand-new tableless session, orphaning any unreleased items in the old one. Fixed by the Counter continuity re-architecture (`core-data-model.md` § Lifecycle invariants) — a Counter session now persists across the whole visit; "Order More" is a plain link back to `/guest/menu` on the *same* session, and ordering again just draws the next round's bill instead of starting a new session. Nothing is ever orphaned because there's no longer a session boundary between rounds.

## Partial release of a single order line

Release (`release_order_item_to_kitchen`) fires an entire order_item row — one line, one quantity, one tap. There's no way to send 5 of a qty-10 line now and the rest later; the guest has to have ordered them as two separate cart submissions up front to get that split.

Current workaround is sufficient for now (order in separate batches if you want staggered timing). Revisit if real usage shows guests wanting to split an already-placed line after the fact.

## resolve_qr_token's session-resume param doesn't prove caller ownership

`resolve_qr_token(p_qr_token, p_existing_session_id)`'s Counter re-scan resume path (supabase/migrations/20260730150634_add_auth_fk_and_rls_policies.sql § 8) checks that `p_existing_session_id` belongs to the QR's own restaurant and is still `active`, but never that the caller actually owns that session. The Next.js route (`apps/web/app/qr/[qrToken]/route.ts`) only ever passes a session id it already verified via the caller's own signed guest-JWT cookie, so the one real call path is safe — but the RPC itself is `grant execute ... to anon`, so anyone with the public anon key could call it directly with any other active Counter session's id (for the same or a different restaurant reached via its own qr_token) and get handed a valid guest JWT for that session: read its cart/orders/bill, place orders on it, release its items.

Practical exposure today is low — session ids are v4 UUIDs never surfaced anywhere a guest (or anyone else) can read them outside their own httpOnly cookie, so exploiting this means already having another guest's private session id from some other leak, not deriving it from anything this app exposes. Not fixed now because a proper fix means forwarding the existing guest JWT as bearer auth on this pre-auth RPC call and checking `auth.jwt() ->> 'session_id'` inside the function — a change to how this endpoint authenticates that shouldn't be made blind right before a push. Revisit before this sees real traffic: forward the JWT and add the ownership check inside the function.
