# GT Orders & Stocks
## Technical Specification

Version: 1.0  
Status: Implementation Baseline  
Project Name: `GT Orders & Stocks`

---

## 1. Document Purpose

This document is the implementation baseline for `GT Orders & Stocks`.

It replaces the earlier mixed planning notes with a stricter, engineering-ready specification focused only on:

- Sales Order
- Inventory Control
- Minimal supporting systems required to make those two modules reliable

This document is intended to be used directly in VS Code and Codex as the authoritative reference for:

- architecture
- domain rules
- database design
- API design
- permissions
- workflow logic
- implementation order
- risk control

---

## 2. Product Scope

### 2.1 In Scope

`GT Orders & Stocks` includes only these core modules:

1. Sales Order
2. Inventory Control

Supporting capabilities allowed in MVP:

- authentication
- role-based access control
- audit logging
- dashboard summaries directly related to orders and stock

### 2.2 Out of Scope

The following are explicitly excluded from MVP:

- invoices
- payments
- accounts receivable
- general ledger
- profit and loss
- balance sheet
- tax engine
- CRM workflows beyond minimal customer master data
- purchase order workflow
- AI automation
- email automation
- mobile app
- multi-warehouse logic

### 2.3 Product Goal

The product goal is to provide a reliable workflow for:

1. creating a sales order
2. reserving stock when the order is confirmed
3. shipping stock through outbound inventory operations
4. keeping `QOH`, `Reserved`, and `Available` correct at all times

---

## 3. Product Principles

### 3.1 Core Principle

This system is not an accounting suite. It is an operational system for order commitment and stock control.

### 3.2 Data Reliability Over Feature Count

For MVP, inventory correctness is more important than supporting every business edge case.

### 3.3 Derived Data Should Stay Derived

`Available` must be computed as:

```text
available = quantityOnHand - quantityReserved
```

It must not be persisted as a writable database field.

### 3.4 State Changes Must Be Explicit

Important state transitions such as:

- order confirmation
- order cancellation
- outbound shipment
- inventory adjustment

must be handled by explicit business actions, not passive field edits.

### 3.5 Transactional Consistency

All inventory-affecting operations must run inside database transactions.

---

## 4. Core Domain Model

### 4.1 Main Entities

The MVP domain consists of these main entities:

- `User`
- `Customer`
- `SKU`
- `SalesOrder`
- `SalesOrderLineItem`
- `InventoryReservation`
- `InventoryMovement`
- `AuditLog`

### 4.2 Core Concepts

#### SKU

A SKU is the stock-keeping unit and the center of inventory accounting.

Each SKU stores:

- current stock on hand
- reserved stock
- pricing defaults
- replenishment metadata

#### Sales Order

A Sales Order is a customer demand document.

It has:

- one customer
- many line items
- a status
- a total amount

#### Inventory Reservation

A reservation is the link between demand and inventory commitment.

It exists only after an order is confirmed.

#### Inventory Movement

A movement is the immutable operational history of stock change.

Movement types:

- `INBOUND`
- `OUTBOUND`
- `ADJUSTMENT`

---

## 5. Business Rules

### 5.1 Inventory Formula Rules

The system must enforce:

```text
quantityOnHand >= 0
quantityReserved >= 0
quantityReserved <= quantityOnHand
available = quantityOnHand - quantityReserved
available >= 0
```

### 5.2 Sales Order Rules

- every sales order must have at least one line item before confirmation
- line quantity must be `> 0`
- unit price must be `>= 0`
- only active SKUs can be added to an order
- a draft order does not reserve stock
- a confirmed order does reserve stock

### 5.3 Overbooking Policy

This specification resolves the earlier ambiguity:

- `Draft` sales orders may be saved even if stock is not currently available
- `Confirm` must fail if any line exceeds current available stock

This rule provides flexibility during quoting and drafting while preserving inventory correctness when commitment happens.

### 5.4 Cancellation Rules

- `DRAFT` orders can be cancelled
- `CONFIRMED` orders can be cancelled only if they have no shipped quantity
- orders with shipped quantity cannot be cancelled by the simple cancel action

### 5.5 Outbound Rules

- outbound without linked sales order may consume only `available`
- outbound linked to a confirmed sales order may consume that order's reservation
- outbound must reduce reservation only for the exact linked sales order and SKU
- outbound must support partial shipment

### 5.6 Deletion Rules

- physical deletion is not allowed for inventory history
- SKU delete in UI must be implemented as status-based soft delete
- only `DRAFT` orders may be hard-deleted in MVP if needed
- for safer auditability, soft delete or cancel is preferred over hard delete

---

## 6. Sales Order State Machine

### 6.1 States

- `DRAFT`
- `CONFIRMED`
- `SHIPPED`
- `COMPLETED`
- `CANCELLED`

### 6.2 Allowed Transitions

```text
DRAFT -> CONFIRMED
DRAFT -> CANCELLED
CONFIRMED -> SHIPPED
CONFIRMED -> CANCELLED
SHIPPED -> COMPLETED
```

### 6.3 Forbidden Transitions

The system must reject:

- `SHIPPED -> CANCELLED`
- `COMPLETED -> CANCELLED`
- `CONFIRMED -> DRAFT`
- direct manual status edits that bypass business actions

### 6.4 MVP Simplification

For MVP implementation:

- `SHIPPED` means all reserved line quantities have been shipped
- `COMPLETED` is optional and may be a manual administrative close

If partial shipping must be supported in the future with richer lifecycle logic, add shipment-line modeling later.

---

## 7. Inventory Reservation Logic

### 7.1 Reservation Creation

Reservation is created only during `Confirm Sales Order`.

For each order line:

1. re-read current SKU values in transaction
2. compute `available`
3. validate `quantityOrdered <= available`
4. create reservation record
5. increment `SKU.quantityReserved`

### 7.2 Reservation Granularity

Each reservation row is unique by:

```text
(salesOrderId, skuId)
```

This is acceptable for MVP as long as each order has at most one logical reservation bucket per SKU.

### 7.3 Reservation Release

Reservations are released only by:

- order cancellation
- outbound shipment linked to that order

### 7.4 Partial Shipment Rule

The earlier draft documents released the entire reservation too aggressively.

The correct MVP behavior is:

- reduce reservation quantity by shipped quantity
- mark reservation `RELEASED` only when remaining reserved quantity becomes zero

This means reservation needs remaining quantity tracking.

Recommended approach:

- keep `quantityReserved` as current remaining reserved quantity
- add original quantity in audit log if needed

---

## 8. Inventory Movement Logic

### 8.1 Inbound

Inbound flow:

1. validate SKU exists and is active
2. validate quantity `> 0`
3. create movement
4. increment `quantityOnHand`
5. write audit log

### 8.2 Outbound

Outbound flow must split into two business cases.

#### Case A: Outbound linked to Sales Order

1. validate linked sales order exists
2. validate order status is `CONFIRMED`
3. validate reservation exists for `(soId, skuId)`
4. validate `shipQty <= reservation.quantityReserved`
5. validate `shipQty <= quantityOnHand`
6. create outbound movement
7. decrement `quantityOnHand`
8. decrement reservation quantity
9. decrement `SKU.quantityReserved`
10. if reservation quantity becomes `0`, mark reservation `RELEASED`
11. if all active reservations for the order are fully released, mark order `SHIPPED`
12. write audit log

#### Case B: Outbound not linked to Sales Order

1. validate `shipQty <= available`
2. create outbound movement
3. decrement `quantityOnHand`
4. do not touch unrelated reservations
5. write audit log

### 8.3 Adjustment

Adjustment flow:

1. validate SKU exists
2. allow positive or negative adjustment
3. ensure resulting `quantityOnHand >= quantityReserved`
4. create movement
5. update `quantityOnHand`
6. write audit log

Adjustment must never silently invalidate reservations.

---

## 9. Role and Permission Model

### 9.1 Roles

- `ADMIN`
- `WAREHOUSE_STAFF`
- `SALES`
- `VIEWER`

### 9.2 Permission Matrix

#### ADMIN

- full access
- manage users
- manage customers
- manage SKUs
- create and confirm sales orders
- perform inventory movements
- view audit logs

#### WAREHOUSE_STAFF

- read SKU and stock dashboards
- perform inbound, outbound, adjustment
- view confirmed orders when needed for fulfillment
- cannot create or edit sales orders
- cannot view or edit user administration

#### SALES

- create draft orders
- edit draft orders
- confirm orders
- cancel draft or confirmed unshipped orders
- view available stock
- cannot perform free inventory adjustments
- cannot manage SKU master data

#### VIEWER

- read-only access to permitted dashboards and records
- no create, update, confirm, cancel, or movement actions

### 9.3 Important Permission Clarification

This specification explicitly resolves an earlier ambiguity:

- `SALES` is allowed to confirm a sales order
- `WAREHOUSE_STAFF` is allowed to ship inventory through outbound movement

That split matches the business intent of order commitment versus fulfillment.

---

## 10. Recommended User Flows

### 10.1 Create Draft Sales Order

1. user selects customer
2. user adds one or more SKU lines
3. system validates SKU active, quantity positive, price valid
4. system calculates totals
5. system saves order as `DRAFT`

### 10.2 Confirm Sales Order

1. sales user opens draft order
2. system re-checks latest inventory in transaction
3. if all lines fit available stock, create reservations
4. status changes to `CONFIRMED`
5. audit log is written

### 10.3 Ship Confirmed Order

1. warehouse user opens outbound action
2. user links the confirmed order
3. user enters shipment quantity per SKU
4. system validates against reservation and QOH
5. system posts movement and reduces reservation
6. if order fully shipped, status changes to `SHIPPED`

### 10.4 Cancel Confirmed Order

1. sales or admin initiates cancel
2. system verifies no shipped quantity exists
3. system releases active reservations
4. system reduces `SKU.quantityReserved`
5. order becomes `CANCELLED`

---

## 11. Architecture

### 11.1 Frontend

Recommended stack:

- React 18
- TypeScript
- Vite
- Tailwind CSS
- React Router
- TanStack Query
- Zustand
- React Hook Form
- Zod

Frontend responsibilities:

- authentication UI
- protected routing
- data tables
- forms and validation
- order and stock dashboards
- role-based action visibility

### 11.2 Backend

Recommended stack:

- Node.js 20
- Express
- TypeScript
- Prisma
- PostgreSQL

Backend responsibilities:

- auth and JWT verification
- role enforcement
- domain validation
- transaction handling
- inventory consistency
- audit logging

### 11.3 Infrastructure

- Docker Compose for local PostgreSQL
- Railway for deployment
- GitHub Actions for CI

---

## 12. Project Structure

```text
gt-orders-stocks/
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   ├── components/
│   │   ├── features/
│   │   │   ├── auth/
│   │   │   ├── orders/
│   │   │   ├── inventory/
│   │   │   └── dashboard/
│   │   ├── lib/
│   │   ├── routes/
│   │   └── main.tsx
│   └── package.json
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.ts
│   ├── src/
│   │   ├── app.ts
│   │   ├── server.ts
│   │   ├── config/
│   │   ├── middleware/
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   ├── customers/
│   │   │   ├── inventory/
│   │   │   ├── orders/
│   │   │   └── audit/
│   │   └── shared/
│   └── package.json
├── docs/
│   ├── GT Orders & Stocks Technical Spec.md
│   ├── api.md
│   ├── erd.md
│   └── decisions.md
├── docker-compose.yml
└── README.md
```

---

## 13. Database Design

### 13.1 Revised Prisma Schema

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id         String   @id @default(cuid())
  email      String   @unique
  password   String
  name       String
  role       Role     @default(VIEWER)
  active     Boolean  @default(true)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  soCreatedBy SalesOrder[]        @relation("createdBy")
  movements   InventoryMovement[] @relation("createdBy")
  auditLogs   AuditLog[]          @relation("user")

  @@map("users")
}

enum Role {
  ADMIN
  WAREHOUSE_STAFF
  SALES
  VIEWER
}

model Customer {
  id             String   @id @default(cuid())
  companyName    String
  email          String?
  phone          String?
  billingAddress String?
  paymentTerms   String   @default("Net 30")
  active         Boolean  @default(true)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  salesOrders    SalesOrder[]

  @@map("customers")
}

model SKU {
  id                String   @id @default(cuid())
  skuCode           String   @unique
  productName       String
  description       String?
  category          String
  unit              String   @default("piece")
  unitCost          Decimal  @db.Decimal(10, 2)
  sellingPrice      Decimal  @db.Decimal(10, 2)
  quantityOnHand    Int      @default(0)
  quantityReserved  Int      @default(0)
  reorderLevel      Int      @default(100)
  reorderQuantity   Int      @default(500)
  warehouseLocation String?
  status            SKUStatus @default(ACTIVE)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  soLineItems       SalesOrderLineItem[]
  reservations      InventoryReservation[]
  movements         InventoryMovement[]

  @@index([status])
  @@map("skus")
}

enum SKUStatus {
  ACTIVE
  INACTIVE
  DISCONTINUED
}

model SalesOrder {
  id              String   @id @default(cuid())
  soNumber        String   @unique
  customerId      String
  customer        Customer @relation(fields: [customerId], references: [id])
  orderDate       DateTime @default(now())
  status          SOStatus @default(DRAFT)
  totalAmount     Decimal  @db.Decimal(12, 2) @default(0)
  notes           String?
  createdBy       String
  user            User     @relation("createdBy", fields: [createdBy], references: [id])
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  lineItems       SalesOrderLineItem[]
  reservations    InventoryReservation[]
  auditLog        AuditLog[] @relation("salesOrder")

  @@index([customerId])
  @@index([status])
  @@index([orderDate])
  @@map("sales_orders")
}

enum SOStatus {
  DRAFT
  CONFIRMED
  SHIPPED
  COMPLETED
  CANCELLED
}

model SalesOrderLineItem {
  id              String   @id @default(cuid())
  soId            String
  so              SalesOrder @relation(fields: [soId], references: [id], onDelete: Cascade)
  skuId           String
  sku             SKU @relation(fields: [skuId], references: [id])
  quantityOrdered Int
  unitPrice       Decimal  @db.Decimal(10, 2)
  lineTotal       Decimal  @db.Decimal(12, 2)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([soId])
  @@index([skuId])
  @@map("so_line_items")
}

model InventoryReservation {
  id               String   @id @default(cuid())
  skuId            String
  sku              SKU @relation(fields: [skuId], references: [id])
  soId             String
  so               SalesOrder @relation(fields: [soId], references: [id], onDelete: Cascade)
  quantityReserved Int
  status           ReservationStatus @default(ACTIVE)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@unique([soId, skuId])
  @@index([skuId])
  @@index([status])
  @@map("inventory_reservations")
}

enum ReservationStatus {
  ACTIVE
  RELEASED
  CANCELLED
}

model InventoryMovement {
  id            String   @id @default(cuid())
  skuId         String
  sku           SKU @relation(fields: [skuId], references: [id])
  movementType  MovementType
  quantity      Int
  referenceType ReferenceType?
  referenceId   String?
  reason        String?
  notes         String?
  createdBy     String
  user          User @relation("createdBy", fields: [createdBy], references: [id])
  createdAt     DateTime @default(now())

  @@index([skuId])
  @@index([createdAt])
  @@index([referenceType, referenceId])
  @@map("inventory_movements")
}

enum MovementType {
  INBOUND
  OUTBOUND
  ADJUSTMENT
}

enum ReferenceType {
  SALES_ORDER
  PHYSICAL_COUNT
  OTHER
}

model AuditLog {
  id         String   @id @default(cuid())
  userId     String
  user       User @relation("user", fields: [userId], references: [id])
  action     String
  tableName  String
  recordId   String
  soId       String?
  salesOrder SalesOrder? @relation("salesOrder", fields: [soId], references: [id], onDelete: SetNull)
  changes    Json?
  createdAt  DateTime @default(now())

  @@index([userId])
  @@index([recordId])
  @@index([tableName])
  @@map("audit_logs")
}
```

### 13.2 Database Notes

- `Available` is computed in service or query response
- `InventoryMovement` is append-only
- `InventoryReservation.quantityReserved` stores remaining reserved quantity
- `ReferenceType` is enum-based to reduce bad free-text data

---

## 14. API Design

### 14.1 Authentication

```text
POST   /api/auth/register
POST   /api/auth/login
GET    /api/auth/me
```

### 14.2 Customers

```text
GET    /api/customers
GET    /api/customers/:id
POST   /api/customers
PUT    /api/customers/:id
```

### 14.3 Sales Orders

```text
POST   /api/sales/orders
GET    /api/sales/orders
GET    /api/sales/orders/:id
PUT    /api/sales/orders/:id
DELETE /api/sales/orders/:id
POST   /api/sales/orders/:id/confirm
POST   /api/sales/orders/:id/cancel
```

### 14.4 Sales Order Lines

```text
POST   /api/sales/orders/:id/lines
PUT    /api/sales/orders/:id/lines/:lineId
DELETE /api/sales/orders/:id/lines/:lineId
```

### 14.5 Inventory

```text
GET    /api/inventory/skus
GET    /api/inventory/skus/:id
POST   /api/inventory/skus
PUT    /api/inventory/skus/:id
DELETE /api/inventory/skus/:id

POST   /api/inventory/movements
GET    /api/inventory/movements
GET    /api/inventory/skus/:id/history

GET    /api/inventory/dashboard
GET    /api/inventory/low-stock
```

### 14.6 Dashboard

```text
GET    /api/dashboard/summary
```

### 14.7 Response Expectations

Standard API response rules:

- use pagination for list endpoints
- return computed `available` for SKU responses
- include related customer and line item data in order detail endpoint
- include reservation summary in order detail endpoint

---

## 15. Service Layer Rules

### 15.1 Required Service Boundaries

Recommended backend services:

- `authService`
- `customerService`
- `skuService`
- `inventoryService`
- `salesOrderService`
- `auditService`

### 15.2 Rule Ownership

- only `salesOrderService.confirmOrder()` can create reservations
- only `inventoryService.createMovement()` can mutate stock counts
- status changes must live in service logic, not controllers
- controllers must remain thin

---

## 16. Transactional Operations

These operations must be wrapped in Prisma transactions:

### 16.1 Confirm Sales Order

Inside one transaction:

- load order and lines
- validate current SKU availability
- create reservations
- increment SKU reserved
- update order status
- write audit log

### 16.2 Cancel Confirmed Order

Inside one transaction:

- load active reservations
- decrement SKU reserved
- mark reservations cancelled or released
- update order status
- write audit log

### 16.3 Create Inventory Movement

Inside one transaction:

- validate current SKU state
- validate reservation when linked to order
- create movement
- mutate SKU counts
- mutate reservation when applicable
- update order status when applicable
- write audit log

---

## 17. Validation Rules

### 17.1 Sales Order Create and Update

- customer must exist and be active
- at least one line item is required for confirm
- line quantity must be integer `> 0`
- unit price must be decimal `>= 0`
- SKU must exist and be `ACTIVE`

### 17.2 SKU Create and Update

- `skuCode` unique
- `productName` required
- `unitCost >= 0`
- `sellingPrice >= 0`
- `reorderLevel >= 0`
- `reorderQuantity >= 0`

### 17.3 Inventory Movement

- quantity must be integer and not zero
- inbound quantity must be positive
- outbound quantity must be positive
- adjustment quantity may be positive or negative
- resulting stock may not violate reservation constraints

---

## 18. Frontend Implementation Notes

### 18.1 Main Screens

- Login
- Dashboard
- Orders List
- Order Detail / Create / Edit
- SKU List
- SKU Detail / Create / Edit
- Inventory Movement Modal

### 18.2 Frontend Rules

- disable actions user cannot perform by role
- show `available` inventory in order entry
- draft save may succeed even if stock is insufficient
- confirm button must clearly surface stock conflicts
- outbound linked to SO must guide the user to reserved quantities

### 18.3 Table and Form Priorities

For MVP, prioritize:

- stable tables
- validation clarity
- business action confirmations

Do not prioritize animation-heavy polish before domain correctness.

---

## 19. Risks and Mitigations

### 19.1 Risk: Stock Drift

Cause:

- updating stock and reservations outside transaction

Mitigation:

- transaction-only stock mutations
- service ownership
- integration tests

### 19.2 Risk: Reservation Corruption

Cause:

- releasing whole reservation on partial shipment

Mitigation:

- decrement reservation quantity precisely
- release only at zero balance

### 19.3 Risk: Ambiguous Role Boundaries

Cause:

- mismatch between sales confirm and warehouse fulfillment permissions

Mitigation:

- enforce permission matrix in middleware and UI

### 19.4 Risk: Overbuilding

Cause:

- adding finance, invoicing, reporting, or multi-warehouse too early

Mitigation:

- keep backlog separate from MVP
- ship order + stock core first

### 19.5 Risk: Weak SO Number Strategy

Cause:

- generating order numbers from random ID fragments

Mitigation:

- implement a dedicated sequence strategy or server-side formatter backed by a counter table if strict numbering is required

For MVP, a simpler unique generator is acceptable if business does not require gapless numbering.

---

## 20. Testing Strategy

### 20.1 Unit Tests

Test service rules for:

- order confirmation
- order cancellation
- inbound movement
- outbound linked to SO
- outbound not linked to SO
- adjustment validation

### 20.2 Integration Tests

Test full flows:

1. create draft order
2. confirm order
3. verify reservation created
4. ship order
5. verify QOH and Reserved updated correctly

Additional scenarios:

- two confirmed orders on same SKU
- insufficient stock on confirm
- partial shipment
- cancel confirmed unshipped order
- blocked cancel after shipment

### 20.3 Manual QA

Manual checks must verify:

- `available = QOH - Reserved`
- order totals equal sum of line totals
- unauthorized actions are blocked

---

## 21. Delivery Plan

### Phase 1

- project scaffolding
- auth
- user roles
- Prisma setup
- base layout

### Phase 2

- customer master data
- SKU CRUD
- inventory dashboard

### Phase 3

- inbound
- outbound
- adjustment
- inventory history

### Phase 4

- sales order CRUD
- confirm logic
- cancel logic
- order detail views

### Phase 5

- integration tests
- seed data
- deployment

---

## 22. Naming Standard

All project-facing naming must use:

- `GT Orders & Stocks`

Codebase naming recommendation:

- repo slug: `gt-orders-stocks`
- frontend package name: `gt-orders-stocks-frontend`
- backend package name: `gt-orders-stocks-backend`
- database name: `gt_orders_stocks`

File naming recommendation:

- business docs may use spaces for readability
- source code folders should use lowercase kebab-case or standard code conventions

---

## 23. Final Implementation Decision

`GT Orders & Stocks` is approved as a focused MVP if implemented with the corrected business rules in this document.

The project is considered technically sound only if:

- reservations are transaction-safe
- outbound logic is reservation-aware
- available stock remains derived
- permission boundaries remain strict
- finance-related scope stays out of MVP

If those conditions are respected, the solution fully matches the intended scope of:

- Sales Order
- Inventory Control

and avoids drifting into a larger ERP rewrite.

