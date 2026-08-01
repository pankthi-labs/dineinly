---
name: dineinly-order-flow
description: Implement or review Dineinly guest ordering, cart, kitchen, table-session, bill, settlement, and role-based workflow changes. Use for any business logic affecting the dine-in service flow.
---

# Dineinly Order Flow

Read `AGENTS.md`, `docs/product.md`, and `docs/core-data-model.md` before implementing a workflow. Read `docs/architecture.md` for mutations and authorization; read `docs/realtime.md` when a state change must be live.

## Workflow

1. Follow the documented RBAC matrix and enforce it server-side.
2. Preserve the defined item lifecycle. Only the documented roles may change each state; do not create new order states.
3. Make order submission idempotent with the client key and documented conflict behavior. Keep multi-table guest mutations transactional and claim-derived.
4. Keep guests anonymous and scoped to one active table session. Never accept tenant, session, price, or authorization facts from guest input.
5. Never process payments. Settlement only records that staff confirmed an external payment method.
6. Stop and ask before implementing tax, service, rounding, or force-terminate open-bill behavior: these are explicitly TBD.
7. Emit the documented realtime update after state changes that affect other participants.

## Verification

Test authorized and unauthorized roles, retry behavior, state-transition guards, tenant/session scoping, and the resulting realtime update.
