# GT Orders & Stocks Project Progress Summary

Date: 2026-05-02

## 1. Project Direction Confirmed

The project scope has been deliberately narrowed to two operational modules only:

- `Sales Order`
- `Inventory`

The implementation direction has moved away from a generic admin tool and toward a more workflow-oriented business system with QuickBooks-like navigation and record handling.

Core working assumptions now in place:

- this is an operational system, not a full accounting system
- inventory reservation happens when a sales order is confirmed
- outbound shipment must stay linked to the sales order and reservation logic
- `La Mirada CA` needs pallet-aware inventory handling
- `Dallas TX` can remain warehouse-level only for now

## 2. Technical Foundation Completed

Project structure has already been created and is running:

- `frontend/`
- `backend/`
- `prisma/schema.prisma`
- `docker-compose.yml`

Base stack already in use:

- Frontend: `React + TypeScript + Vite`
- Backend: `Express + TypeScript`
- Database: `PostgreSQL`
- ORM baseline retained in `Prisma schema`, while runtime database logic has mainly been implemented with `pg`

Core environment work completed:

- frontend and backend bootstrapped
- PostgreSQL connected and running locally
- API structure and module boundaries established
- database initialization and supporting scripts added

## 3. Backend Business Logic Completed

### 3.1 Auth and Roles

Implemented:

- login
- registration
- session-based frontend auth handling
- role model unified to:
  - `ADMIN`
  - `MANAGER`
  - `WAREHOUSE`

Role behavior already enforced in backend routes and frontend visibility.

### 3.2 Customers

Implemented:

- customer create
- customer update
- customer list/detail
- notes support
- customer sales summary
- recent sales orders under customer record
- customer-to-order context navigation

### 3.3 Products / SKUs

Implemented:

- SKU create
- SKU update
- SKU soft delete / deactivate
- SKU search / filter / sort / pagination
- product detail record page
- movement history
- activity / audit log view

### 3.4 Inventory Movements

Implemented:

- `INBOUND`
- `OUTBOUND`
- `ADJUSTMENT`
- `TRANSFER`

Movement features completed:

- movement posting API
- movement ledger
- dashboard metrics
- low stock view
- SKU history
- search by sales order or SKU
- transfer visualization with explicit from/to warehouse and pallet notes

### 3.5 Sales Orders

Implemented:

- create draft order
- multi-line line item editing
- auto-save for draft
- reset / delete draft
- confirm order
- cancel order
- duplicate as draft
- imported historical order visual marker
- activity / audit timeline

### 3.6 Reservation and Fulfillment

Implemented:

- reservation creation on `CONFIRM`
- reservation release on valid cancel
- linked outbound shipment against confirmed orders
- partial shipment support
- auto status transition to `SHIPPED` when reservations are fully consumed

Later enhancement already completed:

- dedicated fulfillment panel directly inside `Sales Order` detail
- warehouse user no longer needs to go to `Inventory Activity` first
- for pallet-tracked warehouses such as `La Mirada`, outbound fulfillment now prompts explicit pallet selection

## 4. Frontend Product Structure Completed

The UI was gradually refactored away from “everything on one page” into clearer workspaces.

Current main navigation structure:

- `Dashboard`
- `Sales Orders`
- `New Sales Order`
- `Customers`
- `Products`
- `Inventory Activity`
- `Pallet Locations`
- `Low Stock`
- `User Management`

Major UX work completed:

- top navigation bar redesign
- business-style action panels
- record-style detail views
- separate queue vs create flows
- customer context and product context return links
- imported historical order markers
- modal-based product search and add-product flows

## 5. User Management Completed

Implemented:

- `User Management` page
- create user
- assign role
- enable / disable account
- reset password

Default working users were standardized:

- `admin@gt.local`
- `manager@gt.local`
- `warehouse@gt.local`

Shared working password was set to:

- `admin123`

## 6. Automated Testing Completed

Playwright-based frontend workflow testing was added.

Coverage already includes:

- login and navigation
- customer to order context flow
- inventory workflow
- fulfillment workflow
- management smoke tests
- role permission coverage

This created a meaningful regression safety net for UI workflow changes.

## 7. Historical Data Import Completed

### 7.1 Reference Sales and Stock Imports

Earlier Google Sheet / TSV imports were analyzed and imported into the system.

Completed:

- stock import baseline
- historical sales order import
- customer import

Imported historical orders were preserved as reference records and clearly labeled in the UI.

### 7.2 Mock/Test Data Cleanup

Completed:

- mock orders removed
- demo / smoke / test SKUs removed
- historical imported business data retained

This left the app in a much cleaner state for real review and planning.

## 8. Pallet Tracking Phase 1 Completed

This was one of the biggest recent changes.

Formal design document created:

- [pallet-tracking-phase-1.md](/Users/davidz/Documents/New%20project/docs/pallet-tracking-phase-1.md:1)

### 8.1 Data Model Foundation Added

Added or planned into schema/runtime:

- `warehouses`
- `pallet_locations`
- `inventory_balances`
- `pallet_stock_references`

Important design choice:

- `La Mirada CA` is pallet-tracked
- `Dallas TX` remains warehouse-only for now

### 8.2 API and UI Support Added

Implemented:

- warehouse list API
- pallet location list API
- pallet stock inspection API
- SKU location balance API
- pallet location create / edit / delete flows

Frontend support added:

- `Pallet Locations` page skeleton
- pallet maintenance modal
- product `Stock by Location`
- movement form upgraded with warehouse / pallet awareness

### 8.3 Protection Rules Added

Guardrails already implemented:

- pallet cannot be deactivated or moved while stock/reserved quantity is still assigned
- pallet cannot be deleted if it has balance history or movement history

## 9. Sheet13 Pallet Reference Work Completed

The file:

- `/Users/davidz/Downloads/Stock Counts in La Mirada Warehouse - Sheet13.tsv`

was analyzed as a pallet reference source for `La Mirada CA`.

Work completed:

- normalized preview generated
- anomaly review document created
- invalid pallet rows grouped into `Unknown Pallet Location`
- category conflicts normalized
- product name conflicts normalized
- SKU typo fixes applied
- confirmed pallet code format recorded

Generated files:

- [Sheet13-normalized-preview.tsv](/Users/davidz/Documents/New%20project/docs/Sheet13-normalized-preview.tsv:1)
- [Sheet13-anomaly-review.md](/Users/davidz/Documents/New%20project/docs/Sheet13-anomaly-review.md:1)
- [Sheet13-ready-to-import-pallet-reference.tsv](/Users/davidz/Documents/New%20project/docs/Sheet13-ready-to-import-pallet-reference.tsv:1)

### 9.1 Database Import Completed

A dedicated pallet reference import script was added:

- [import-pallet-reference.ts](/Users/davidz/Documents/New%20project/backend/src/scripts/import-pallet-reference.ts:1)

NPM command added:

- `npm run import:pallet-reference`

Import result already executed successfully:

- `135` pallet reference rows imported
- `32` pallet locations created
- data written to `pallet_stock_references`

Important safety decision:

- Sheet13 data was imported as `reference layer`
- it did **not** directly overwrite live `SKU quantityOnHand`

This preserves operational safety until physical stock reconciliation is completed.

## 10. Current State Of The System

The project is no longer at scaffolding stage.

Current reality:

- core business flows are implemented
- sales order confirmation and shipment logic works
- inventory movement logic works
- UI is substantially productized
- pallet-tracking foundation exists
- real reference data has been analyzed and partially imported

The system is now in a transition phase:

- from MVP build-out
- into operational design refinement and warehouse workflow planning

## 11. Main Open Issues / Strategy Questions

These are the biggest remaining questions for the next planning round.

### 11.1 Inventory Truth Model

Still needs final strategy:

- when and how pallet reference data should become official inventory balance
- whether `inventory_balances` should become the primary source of truth
- how reconciliation updates should affect aggregate SKU totals

### 11.2 SKU Master Data Cleanup

Still open:

- some Sheet13 SKU codes do not match current SKU master records
- naming and categorization are cleaner now, but full SKU normalization is not finished

### 11.3 Fulfillment UX

Better than before, but still open for refinement:

- show only pallets with available stock
- show pallet available quantities during pick
- possibly add a dedicated warehouse fulfillment workspace

### 11.4 Operational Reconciliation Flow

Still not finalized:

- how physical stock checks should update pallet balances
- whether unknown pallet stock should stay as exception inventory or be reassigned in workflow

## 12. Recommended Starting Point For The Next Brainstorm

If opening a new planning window, the cleanest topics to discuss next are:

1. What should become the official inventory truth:
   - `SKU totals`
   - `inventory_balances`
   - or staged reconciliation between them

2. What exact workflow warehouse staff should follow in `La Mirada`:
   - receiving
   - moving
   - picking
   - recounting

3. How to handle pallet exceptions:
   - `Unknown Pallet Location`
   - mismatched SKU master records
   - physical stock verification updates

4. Whether the next phase should prioritize:
   - reconciliation tools
   - fulfillment UX
   - SKU master cleanup
   - or inventory reporting

## 13. Suggested One-Line Project Status

Suggested status statement for the next brainstorming session:

> GT Orders & Stocks already has working Sales Order and Inventory flows, plus Phase 1 pallet-tracking infrastructure for La Mirada; the next planning round should decide how pallet reference data becomes operational inventory truth and how warehouse execution should work day to day.
