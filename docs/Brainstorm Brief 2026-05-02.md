# GT Orders & Stocks Brainstorm Brief

Date: 2026-05-02

## 1. Current Position

The project already has a working operational base for:

- `Sales Orders`
- `Inventory`

Main flows already work:

- create draft sales order
- edit multi-line draft
- confirm order
- create reservation
- linked outbound shipment
- auto transition to `SHIPPED`
- inventory inbound / outbound / adjustment / transfer
- customer records
- product records
- role-based access

This is no longer a blank project. The next round is about refining the operating model, not just adding basic CRUD.

## 2. What Is Already Strong

### Sales Order

- draft-to-confirm flow is in place
- reservations are created correctly
- linked outbound is working
- order detail has action panel and audit/activity history
- fulfillment can now be triggered directly from order detail

### Inventory

- SKU management works
- movement ledger works
- low stock and dashboard exist
- transfer logic exists
- La Mirada pallet tracking foundation has been added

### Warehouse / Pallet Direction

- `La Mirada CA` is being treated as pallet-tracked
- `Dallas TX` is still warehouse-level only
- this split is already reflected in the design direction

### Data Work

- historical order / stock imports completed
- mock data cleaned out
- Sheet13 pallet reference cleaned and imported as reference data

## 3. Most Important Strategic Question

The biggest unresolved question is:

**What should become the operational source of truth for inventory?**

Current candidates:

1. `SKU totals` remain the main truth
2. `inventory_balances` becomes the main truth
3. pallet reference stays separate until reconciliation is completed

This decision affects:

- warehouse execution
- stock adjustment logic
- reporting accuracy
- future fulfillment UX

## 4. What Has Been Done For Pallet Tracking

Already completed:

- `warehouses`
- `pallet_locations`
- `inventory_balances` foundation
- `pallet_stock_references`
- pallet maintenance UI
- Sheet13 cleanup
- Sheet13 imported into database as reference layer

Important current design decision:

- Sheet13 data was **not** used to overwrite live total SKU stock
- it was imported as safe reference data only

This was the correct short-term decision, but it means reconciliation is still ahead of us.

## 5. Main Open Questions For Next Planning

### A. Inventory Truth / Reconciliation

- When should pallet reference data become live balance data?
- How should physical stock counts update system balances?
- Should `Unknown Pallet Location` remain a holding bucket or become a real workflow?

### B. Warehouse Workflow

For `La Mirada`, what is the exact daily flow for:

- receiving
- moving pallets
- picking for sales orders
- stock recounting
- exception handling

### C. Fulfillment UX

Current fulfillment is already working, but can still improve:

- show only pallets with available stock
- show pallet quantities during pick
- guide warehouse user to best pallet choice

### D. SKU Master Cleanup

Some SKU records still do not map perfectly across:

- product master
- imported reference data
- pallet reference rows

This is manageable, but should be planned rather than ignored.

## 6. Recommended Discussion Paths

If you want the next brainstorm to be productive, I’d suggest picking one of these paths:

### Path 1. Reconciliation First

Focus:

- inventory truth model
- pallet reference to live balance strategy
- physical stock check workflow

Best if your next real-world step is stock verification.

### Path 2. Warehouse Execution First

Focus:

- La Mirada pick / move / receive process
- fulfillment screen design
- pallet-level operational UX

Best if warehouse staff usage is the main priority.

### Path 3. Data Integrity First

Focus:

- SKU normalization
- product master alignment
- reference import quality
- exception handling

Best if you want clean data before scaling process complexity.

## 7. My Recommendation

If I were choosing the next round, I would prioritize:

1. `Reconciliation First`
2. then `Warehouse Execution First`

Reason:

- the system already works well enough for workflow prototyping
- the biggest long-term risk is inventory truth inconsistency
- once reconciliation logic is clear, fulfillment UX becomes much easier to finalize

## 8. Best Starting Question For The New Window

If you want one clean opener for the next brainstorm, I suggest:

> We already have working Sales Order and Inventory flows plus La Mirada pallet-tracking foundations. What should be the official inventory source of truth, and what exact warehouse reconciliation workflow should move pallet reference data into live operational stock?
