# GT Orders & Stocks UI Design Spec v1.0

## Purpose

GT Orders & Stocks is an internal inventory, customer, and sales order management system.

The MVP should stay simple and focus on three core workflows:

```text
Inventory → Customer → Sales Order
```

## Design Principle

Build from simple to complex.

The first version should only support the core business workflow:

1. Search and edit inventory.
2. Search and edit customers.
3. Create and review sales orders.

Do not add dashboard, reports, invoice, delivery, payment tracking, or database complexity in the first implementation.

## Theme

Professional Google Workspace-style UI.

- Light gray page background
- White cards
- Simple tables
- Dark gray primary pill buttons
- Light gray secondary pill buttons
- Clear 14px body text
- Larger click areas for users age 50+

## Typography

| Element | Size | Font Direction |
|---|---:|---|
| Page title | 22px | Georgia / serif style |
| Section title | 16px | Georgia / serif style |
| Body text | 14px | Arial / sans-serif |
| Table text | 14px | Arial / sans-serif |
| Button text | 13px | Arial / sans-serif |
| Helper text | 12px | Arial / sans-serif |

## Colors

| Token | Value |
|---|---|
| Page background | #F7F8FA |
| Card background | #FFFFFF |
| Header background | #F1F3F4 |
| Border | #E0E0E0 |
| Primary text | #202124 |
| Secondary text | #5F6368 |
| Helper text | #80868B |
| Primary button | #2F3437 |
| Secondary button | #EEF0F2 |

## Buttons

All buttons should use a little pill style.

Primary actions:

- Add SKU
- Add Customer
- Add Item
- Save
- Save Sales Order

Secondary actions:

- Edit
- Cancel
- Print / Export

Do not use large red delete buttons in v1.

## Pages

### Inventory

Purpose:

- Search SKU
- Add SKU
- Edit SKU
- Review Qty (CTN)

Main table columns:

- SKU Code
- Product Description
- Category
- Total Qty (CTN)
- Action

Drawer fields:

- SKU Code
- Product Description
- Category
- Qty (CTN)
- Width
- Length
- Selling Price
- Pallet Location

### Customer

Purpose:

- Search Customer
- Add Customer
- Edit Customer
- Provide customer data for Sales Order

Main table columns:

- Customer Name
- Orders
- Sales Total
- Payment Info
- Sales Rep
- Last Order
- Action

Drawer fields:

- Customer Name
- Contact Person
- Phone
- Email
- Default Shipping Address
- Payment Term
- Notes

### Sales Order

Purpose:

- View sales order list
- Select one sales order
- Review order details
- Review line items
- Edit line item fields in mockup drawer

Sections:

1. Sales Order List
2. Selected Sales Order Detail
3. Line Items
4. Summary actions

Line item fields:

- SKU Code
- Description
- Width
- Length
- Category
- Qty Sold
- Unit Price
- Total

## Manual Override Rule

Sales Order fields auto-filled from Inventory or Customer must remain manually editable.

Manual changes in Sales Order should not automatically update Inventory or Customer master data in v1.

## Not Included in v1

- Dashboard
- Reports
- Settings page
- User management UI
- Advanced permissions
- Inventory history
- Automatic inventory deduction
- Invoice module
- Payment tracking
- Delivery tracking
- Partial shipment
- Backorder
- Tax rules
- Discount rules
- Freight rules
- Multi-currency

## Implementation Note

Use local seed data first. Connect a database only after the UI workflow is stable.
