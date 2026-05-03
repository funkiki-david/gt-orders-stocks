# GT Orders & Stocks Pallet Tracking Phase 1

## Goal

Phase 1 adds real pallet-aware inventory structure for `La Mirada CA` while keeping `Dallas TX` as a simpler warehouse-level location.

This phase is designed to answer two operational questions:

1. What SKU and stock are currently sitting on a given pallet location?
2. For a given SKU, how is stock distributed across pallet locations?

## Scope

Included in Phase 1:

- `warehouses` master data
- `pallet_locations` master data
- `inventory_balances` for warehouse and pallet-level stock
- movement API support for warehouse and pallet identifiers
- `Pallet Locations` page skeleton
- movement form upgrade with warehouse-aware inputs

Not included in Phase 1:

- pallet-level reservation allocation
- automatic pick recommendations
- pallet-level fulfillment optimization
- Dallas pallet tracking

## Warehouse Model

Two warehouses are supported initially:

- `LA_MIRADA`
  - Name: `La Mirada CA`
  - `isPalletTracked = true`
- `DALLAS`
  - Name: `Dallas TX`
  - `isPalletTracked = false`

Behavior:

- `La Mirada CA` requires pallet location support in operational flows.
- `Dallas TX` stays warehouse-level only.

## Data Model

### `warehouses`

- `id`
- `code`
- `name`
- `isPalletTracked`
- `isActive`
- `createdAt`
- `updatedAt`

Purpose:

- Defines physical warehouse sites.
- Drives UI logic for whether pallet inputs are required.

### `pallet_locations`

- `id`
- `warehouseId`
- `code`
- `label`
- `zone`
- `isActive`
- `notes`
- `createdAt`
- `updatedAt`

Purpose:

- Defines named pallet locations within a warehouse.
- Only `La Mirada CA` uses these records in Phase 1.

### `inventory_balances`

- `id`
- `skuId`
- `warehouseId`
- `palletLocationId` nullable
- `quantityOnHand`
- `quantityReserved`
- `updatedAt`

Rules:

- For pallet-tracked warehouses such as `La Mirada CA`, balances should ultimately live at pallet level.
- For non-pallet warehouses such as `Dallas TX`, `palletLocationId` remains `null`.
- `skus.quantityOnHand` and `skus.quantityReserved` remain as aggregate totals for compatibility with the current app.

## API Additions

### New endpoints

- `GET /api/inventory/warehouses`
- `GET /api/inventory/pallet-locations?warehouseId=...`
- `GET /api/inventory/pallet-locations/:id/stock`
- `GET /api/inventory/skus/:id/location-balances`

### Movement API extension

`POST /api/inventory/movements` now accepts:

- `warehouseId`
- `fromWarehouseId`
- `toWarehouseId`
- `palletLocationId`
- `fromPalletLocationId`
- `toPalletLocationId`

## Movement Logic

### INBOUND

- Warehouse is required.
- If target warehouse is pallet-tracked, destination pallet should be selected.
- Increase `inventory_balances.quantityOnHand`.
- Recalculate aggregate SKU totals.

### OUTBOUND

- Warehouse is required.
- If source warehouse is pallet-tracked, source pallet should be selected.
- Decrease `inventory_balances.quantityOnHand`.
- Recalculate aggregate SKU totals.
- Reservation behavior remains SKU-level in Phase 1.

### TRANSFER

- Supports warehouse-to-warehouse and pallet-to-pallet movement.
- Does not change total stock.
- Decreases source balance and increases destination balance.
- For `La Mirada CA`, pallet transitions are first-class.

### ADJUSTMENT

- Adjusts stock on the selected warehouse or warehouse+pallet balance.
- Must not allow resulting QOH below zero.

## UI Changes

### Inventory Navigation

Inventory workspace should include:

- `Products`
- `Inventory Activity`
- `Pallet Locations`
- `Low Stock`

### `Pallet Locations` page

Two working views:

- `By Pallet`
  - Select warehouse
  - List pallet locations
  - Inspect stock currently assigned to a pallet
- `By SKU`
  - Select a SKU
  - Review warehouse and pallet distribution

### Movement Form

- Add warehouse selection
- Show pallet inputs only when the selected warehouse is pallet-tracked
- Keep Dallas simpler by hiding pallet inputs

## Seed and Backfill Strategy

Phase 1 should create:

- `La Mirada CA`
- `Dallas TX`

Existing inventory can be backfilled into `inventory_balances` using current SKU totals:

- If `skus.warehouseLocation` references Dallas, map to `Dallas TX`
- Otherwise default to `La Mirada CA`
- Initial backfill uses `palletLocationId = null`

This gives the system a stable bridge into pallet-aware logic without breaking the current SKU totals.

## Phase 1 Implementation Notes

- Existing product pages can keep using SKU aggregate quantities.
- `Pallet Locations` page provides the first operational view into pallet-aware stock.
- Later phases can move reservation logic from SKU-level to warehouse or pallet-level allocation.
