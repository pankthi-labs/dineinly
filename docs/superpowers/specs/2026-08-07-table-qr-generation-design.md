# Table QR Generation — Design

Date: 2026-08-07
Status: Approved (design), not yet planned/implemented

## Scope

QR generation for restaurant tables, surfaced as actions on the Table Roster page (the roster page itself — table create/list/edit — is a separate, not-yet-built piece; this spec assumes it exists and adds QR-specific behavior to it).

Out of scope: Table Roster CRUD (add/edit/delete table rows), the `app/qr/[qrToken]` resolve step's invalid-token UX (not yet built — this spec depends on it existing but does not design it).

## Background

Per `docs/product.md` and `docs/architecture.md`:

- A QR code is access-only, never business state. It resolves to a restaurant table, then joins/creates that table's active session.
- `restaurant_tables.qr_token` (`packages/db/src/schema/restaurant-table.ts`) is `text().notNull().unique()`, globally unique, already part of the schema.
- Permission "Manage Tables & QR Codes" is Owner/Manager/Dineinly Admin only (`docs/product.md` RBAC table). Waiter and Kitchen cannot touch this.

Because `qr_token` is `notNull`, a table can never exist without one — "Generate QR" is therefore a **view/download/regenerate** action, not a create-from-scratch action.

## Data Model

No schema change. `qr_token` is generated server-side (`crypto.randomUUID()`) in the same insert that creates the table row (table-creation flow, out of scope here). Regenerate is a plain update:

```
UPDATE restaurant_tables SET qr_token = $new WHERE id = $tableId AND restaurant_id = $tenant
```

`session_id` is untouched by regeneration — an active session on the table is unaffected; only future scans of the old, now-stale QR fail to resolve.

## tRPC Procedures

New procedures on the tables router, RBAC-gated to Owner/Manager/Dineinly Admin:

- `regenerateTableQr({ tableId })` — mutation. Rotates `qr_token`, returns the updated row.
- `downloadTableQrPdf({ tableId })` — query. Returns single-page PDF bytes: QR code + table label.
- `downloadAllTableQrPdf({ restaurantId })` — query. Returns one multi-page PDF, one page per table.

No separate "preview" endpoint. The table-list query the roster page already needs returns `qr_token`; the inline thumbnail and "copy link" action both derive `{QR_BASE_URL}/qr/{qrToken}` client-side from data already on the page — RLS already scopes that list query to the caller's tenant, so this isn't new exposure.

## Rendering & PDF Generation

- **Token**: `crypto.randomUUID()`, server-side, at table insert / on regenerate.
- **Inline thumbnail** (Table Roster row): rendered client-side from `qr_token` (canvas-based QR library, e.g. `qrcode.react`) — cheap, no round-trip, good enough for an on-screen preview.
- **Download PDFs** (single + bulk): rendered fully server-side — QR as SVG (`qrcode` npm package) composed into a PDF via `pdf-lib` or `@react-pdf/renderer`. One rendering path shared by both the single-table and bulk procedures (bulk = loop producing one page per table). Server-side keeps print output consistent regardless of the admin's browser, and keeps with "tRPC is the only data layer" — the client never fabricates a QR for anything that leaves the app as a printable artifact.

These are new dependencies not yet in `docs/tech-stack.md` — flag there when implemented.

## UI — Table Roster

- Each row: table label, small QR thumbnail (client-rendered).
- Click thumbnail → modal: enlarged QR, "Copy Link" button, "Download PDF" button.
- Row actions: **Download PDF** (calls `downloadTableQrPdf`), **Regenerate** (confirm dialog warning that the old printed QR stops working immediately → on confirm, calls `regenerateTableQr`, thumbnail updates live).
- Page-level header action: **Download All QR Codes** (calls `downloadAllTableQrPdf`).

PDF content per table: QR code + table label printed underneath (no restaurant name/logo — the roster is already scoped to one restaurant, so cross-restaurant mixups aren't a print-time risk here).

## Error Handling

- Regenerate DB failure → toast error, token/thumbnail stay unchanged (no optimistic update before success).
- Scanned old token after regenerate → resolve step (`app/qr/[qrToken]`, not yet built) should return a not-found state; this spec depends on that behavior existing but does not design it.
- PDF generation failure (either procedure) → toast error, no partial file returned to the client.
- Concurrent regenerate clicks on the same table → last write wins; no locking needed — single-admin action, low stakes, no data corruption possible (just a token value overwrite).

## Testing

- RBAC: `regenerateTableQr` rejects Waiter/Kitchen callers.
- Regenerate produces a token different from the previous one; old token no longer matches any row.
- `downloadTableQrPdf` / `downloadAllTableQrPdf` return valid, parseable PDF bytes; bulk output has one page per table in the restaurant.

## Open Dependencies (not designed here)

- Table Roster page itself (create/list/edit tables).
- `app/qr/[qrToken]` resolve step, including its invalid/stale-token UX.
