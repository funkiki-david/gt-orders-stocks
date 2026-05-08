# GT Orders & Stocks

Internal inventory, customer, and sales order management system prototype.

## Current Stage

This project is currently in the UI prototype and front-end planning stage.

The first MVP focuses on three core pages:

1. Inventory
2. Customer
3. Sales Order

The current workflow is:

```text
Inventory → Customer → Sales Order
```

## MVP Scope

### Included in v1

- Inventory list
- SKU search
- Add / edit SKU drawer
- Customer list
- Customer search
- Add / edit customer drawer
- Sales order list
- Sales order detail view
- Sales order line items
- Manual override fields
- Local seed data for UI testing

### Not included in v1

- Dashboard
- Reports
- Advanced permissions UI
- Invoice module
- Payment tracking
- Delivery tracking
- Automatic inventory deduction
- Multi-warehouse management
- Railway database connection
- Production deployment

## UI Direction

The UI follows a simple Google Workspace-style layout:

- Light gray page background
- White content cards
- Dark gray primary pill buttons
- Light gray secondary pill buttons
- Clear 14px body text
- Simple tables and drawers
- Search-first workflow

The design is intended to be readable and easy to use for users age 50+.

## Recommended Development Path

The suggested implementation order is:

```text
1. Keep the current HTML prototype as reference
2. Convert the prototype into a Next.js front-end
3. Use local seed data first
4. Confirm Inventory, Customer, and Sales Order workflows
5. Design database schema after the front-end workflow is stable
6. Connect Railway PostgreSQL later
```

## Suggested Tech Stack

Planned front-end direction:

- Next.js
- TypeScript
- Tailwind CSS
- Local JSON / TypeScript seed data during MVP

Database and deployment are intentionally deferred until the UI and workflow are stable.

## Project Structure Plan

Suggested structure:

```text
GT-Orders-Stocks/
  README.md
  .gitignore
  docs/
    ui-design-spec.md
    codex-handoff.md
  prototypes/
    gt-orders-stocks-ui-prototype-v1-2-full-seed-data.html
  data/
    inventory-seed.json
    sales-orders-seed.json
    customers-seed.json
  app/
  components/
  lib/
```

## Important Notes

- The current seed data is for UI testing and prototype validation.
- Seed data should not be treated as the final database structure.
- Sales Order manual overrides should not automatically update Inventory or Customer master data in v1.
- Save actions can remain local until the database schema is finalized.
