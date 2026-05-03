# GT Orders & Stocks ZIP Analysis

## Source documents

The original ZIP contains 3 Markdown documents:

1. `GT_Orders_Stocks_Summary.md`
2. `GT_Orders_Stocks_UI_Design.md`
3. `GT_Orders_Stocks_Components.md`

It does not contain source code.

The missing requirements file has now been provided separately:

4. `GT_QBO_V2_Focused_Sales_Inventory.md`

## What this project is

This is an MVP for a sales order and inventory management system with a QuickBooks-inspired UI.

Core business scope:

- Sales order lifecycle: create -> confirm -> ship -> complete
- Inventory operations: inbound, outbound, adjust
- Reservation logic: reserve stock when a sales order is confirmed
- Role-based access: `ADMIN`, `WAREHOUSE_STAFF`, `SALES`, `VIEWER`

Suggested stack from the docs:

- Frontend: React 18 + TypeScript + Tailwind CSS
- State/data: Zustand + React Query + React Hook Form + Zod
- Backend: Node.js + Express + Prisma
- Database: PostgreSQL
- Local infra: Docker Compose
- Deployment: Railway + GitHub Actions

## Main frontend UX structure

The UI docs define:

- Top navigation + left sidebar layout
- Dashboard
- Orders list/detail/create views
- SKU list/detail views
- Stock movement modals
- Role-specific navigation and visibility rules
- Responsive behavior for mobile/tablet/desktop

Visual direction:

- QuickBooks-like business UI
- Green/blue/orange/red status language
- Dense but readable data views
- Tables + cards as the main information patterns

## Main frontend implementation artifacts

The components document includes:

- Tailwind theme proposal
- Global CSS guidance
- 9 core components:
  - `Button`
  - `Input`
  - `Select`
  - `Table`
  - `Modal`
  - `Badge`
  - `Card`
  - `Skeleton`
  - `Alert`
- One example page for creating a sales order

Important note:

These are example snippets, not a production-ready library. Some code will need cleanup before direct use.

## Key backend/business rules

The most important domain rule is stock reservation:

- `available = quantityOnHand - quantityReserved`
- Confirming a sales order should create reservation records
- Shipping stock should reduce `quantityOnHand`
- If outbound is linked to an order, reserved stock should also be released/reduced
- Cancelling a confirmed order should release reservations

This logic should be implemented transactionally in Prisma to avoid race conditions.

The main requirements document also defines:

- customers
- sales orders
- sales order line items
- inventory reservations
- inventory movements
- audit logs
- role-based auth with `ADMIN`, `WAREHOUSE_STAFF`, `SALES`, `VIEWER`

## Confirmed backend schema from the missing requirements doc

The provided Prisma schema covers these entities:

- `User`
- `Customer`
- `SKU`
- `SalesOrder`
- `SalesOrderLineItem`
- `InventoryReservation`
- `InventoryMovement`
- `AuditLog`

Key enum sets:

- `Role`
- `SKUStatus`
- `SOStatus`
- `ReservationStatus`
- `MovementType`

Important schema decisions:

- `SKU.quantityOnHand` and `SKU.quantityReserved` are stored fields
- `quantityAvailable` is described in prose but is not stored in Prisma
- `SalesOrder.soNumber` is unique and generated after record creation
- reservation uniqueness is `@@unique([soId, skuId])`
- inventory movement history is append-only
- audit logs are generic and can attach to a sales order

## Confirmed API surface

Sales:

- `POST /api/sales/orders`
- `GET /api/sales/orders`
- `GET /api/sales/orders/:id`
- `PUT /api/sales/orders/:id`
- `DELETE /api/sales/orders/:id`
- `POST /api/sales/orders/:id/confirm`
- `POST /api/sales/orders/:id/cancel`
- `POST /api/sales/orders/:id/lines`
- `PUT /api/sales/orders/:id/lines/:lineId`
- `DELETE /api/sales/orders/:id/lines/:lineId`
- `GET /api/sales/orders/search`

Inventory:

- `POST /api/inventory/skus`
- `GET /api/inventory/skus`
- `GET /api/inventory/skus/:id`
- `PUT /api/inventory/skus/:id`
- `DELETE /api/inventory/skus/:id`
- `POST /api/inventory/movements`
- `GET /api/inventory/movements`
- `GET /api/inventory/skus/:id/history`
- `GET /api/inventory/skus/search`

Dashboard/auth:

- `GET /api/dashboard/sales-summary`
- auth endpoints are described in planning sections but not fully specified in the main API list

## Gaps and inconsistencies across the docs

The missing requirements document resolved the biggest gap, but a few inconsistencies still matter:

1. Overbooking rule is inconsistent.
   The FAQ in the summary says inventory shortage should block confirmation, but the API pseudocode says draft creation may allow overbooking and even comments that creation does not check availability. We should choose one rule explicitly before implementation.

2. `quantityAvailable` is described as a stored field in prose but omitted from Prisma.
   Best implementation is to compute it as `quantityOnHand - quantityReserved`, not persist it.

3. Outbound validation in pseudocode checks `quantity > quantityOnHand`, not `quantity > available`.
   That is too loose for non-order outbound flows if reserved inventory must stay protected.

4. Outbound reservation release is too coarse.
   The pseudocode releases reservation rows with `updateMany(... status: 'RELEASED')`, but does not support partial shipment per reservation line.

5. SO number generation using `so.id.slice(-4)` is not ideal.
   It is deterministic enough for MVP demos, but not a robust business sequence.

6. Inventory confirmation logic lacks transaction boundaries and concurrency control.
   Confirm/cancel/outbound should use Prisma transactions, and likely row-level consistency checks or optimistic retry logic.

7. Soft delete is mentioned for SKU, but Prisma only has `status`.
   We should model deletion as status change to `INACTIVE` or `DISCONTINUED`, not physical deletion.

## Recommended implementation decisions

To keep the MVP stable, use these interpretations:

- `available` is derived only
- draft SO can be saved without reservation
- confirmation must enforce `line.quantity <= available`
- outbound without linked SO must enforce `quantity <= available`
- outbound linked to SO should decrement the matching reservation, not blindly all reservation state for that SKU/order
- cancel SO should only be allowed for `DRAFT` and `CONFIRMED`, with reservation release only for `CONFIRMED`
- SKU delete in UI should be a soft delete via `status`

## Recommended first schema adjustments before coding

Before generating the first migration, I recommend these changes from the provided draft schema:

- add `deletedAt` only if you want true soft delete metadata
- add explicit indexes for `skuCode`, `soNumber`, and `orderDate` if query volume matters
- consider `referenceType` as an enum instead of free text
- consider storing `updatedAt` on `InventoryMovement` only if edits are allowed; otherwise leave it append-only
- add shipment-specific modeling later only if partial shipments are required

## Recommended repo structure

Recommended workspace layout:

```text
gt-orders-stocks/
├── frontend/
├── backend/
├── docs/
├── docker/
└── docker-compose.yml
```

Recommended docs to keep in-repo:

- `docs/product-scope.md`
- `docs/ui-notes.md`
- `docs/domain-rules.md`
- `docs/api-plan.md`

## Best way to start in Codex + VS Code

Recommended build order:

1. Create the monorepo structure
2. Scaffold `frontend/` with Vite + React + TypeScript
3. Scaffold `backend/` with Express + TypeScript + Prisma
4. Add PostgreSQL via Docker Compose
5. Define Prisma schema first
6. Build auth + roles
7. Build SKU CRUD
8. Build stock movement flows
9. Build sales order flows
10. Add integration tests

## Practical MVP slice

If we want the safest first milestone, build this order:

1. Users + login
2. SKU CRUD
3. Inventory inbound/outbound/adjust
4. Inventory dashboard numbers
5. Sales order draft creation
6. Sales order confirmation with reservation
7. Sales order cancellation with release

## Risks to watch early

- Reservation logic and concurrent confirmations
- Role visibility differences between Orders and Stocks
- Whether outbound can partially consume a reservation
- Whether stock can go negative
- Customer, pricing, tax, and unit-of-measure requirements are still underdefined

## Recommendation

The docs are now sufficient to start a clean implementation.

The best next step is no longer "find the missing spec", but:

1. turn the Prisma schema into a real `backend/prisma/schema.prisma`
2. resolve the rule conflicts above
3. scaffold the monorepo
4. implement auth, SKU CRUD, and inventory movements first

## Files for reference

- Analysis note: [ZIP_ANALYSIS.md](/Users/davidz/Documents/New%20project/ZIP_ANALYSIS.md:1)
- Requirements doc: [GT_QBO_V2_Focused_Sales_Inventory.md](/Users/davidz/Downloads/GT_QBO_V2_Focused_Sales_Inventory.md:1)
