# Backend MVP Phase 1

## Goal

Add a Railway PostgreSQL database foundation for GT Orders & Stocks while keeping the current front-end stable.

This phase adds:

- Prisma
- PostgreSQL schema
- Database seed script
- Prisma client helper
- Environment variable example

This phase does not yet convert all pages to read/write from the database.

## Railway Setup

Railway project:

```text
GT Orders Stocks Staging
```

PostgreSQL service:

```text
Postgres
```

Railway provides:

```text
DATABASE_URL
PGHOST
PGPORT
PGUSER
PGPASSWORD
PGDATABASE
```

Do not commit any secret value to GitHub.

## Local Setup

Create a local env file:

```bash
cp .env.example .env.local
```

Then paste your Railway `DATABASE_URL` into `.env.local`:

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE"
```

## Install Dependencies

```bash
npm install
```

## Push Schema to Railway PostgreSQL

```bash
npm run db:push
```

## Seed Database

```bash
npm run db:seed
```

## Inspect Database

```bash
npm run db:studio
```

## Build Check

```bash
npm run build
```

## Current Tables

### Product

Stores SKU master data:

- SKU Code
- Product Name
- Category
- Qty (CTN)
- Pallet Location
- Selling Price

### Customer

Stores customer master data:

- Company Name
- Contact Person
- Phone
- Email
- Billing Address
- Shipping Address
- Payment Term
- Notes

### SalesOrder

Stores sales order header information:

- Sales Order Number
- Order Date
- Ship Date
- Customer Snapshot
- PO Number
- Payment Info
- Ship Method
- Sales Rep
- Fulfillment Status
- Payment Status
- Cancel Reason
- Status Notes
- Total Qty
- Subtotal

### SalesOrderItem

Stores sales order line item snapshots:

- SKU Code
- Product Description
- Width
- Length
- Category
- Qty (CTN)
- Unit Price
- Total
- Pallet Location Snapshot

## Important Design Rules

- Sales Order line items store snapshots.
- Updating Product master data should not change historical Sales Orders.
- Updating Customer master data should not change historical Sales Orders.
- Inventory deduction is not included in this phase.
- Payment collection is not included in this phase.
- Authentication is not included in this phase yet.

## Next Backend Steps

After schema and seed are confirmed:

1. Convert Inventory page to read from database.
2. Convert Customer page to read from database.
3. Convert Sales Order page to read from database.
4. Add server actions for real save/edit.
5. Add simple authentication before public use.
