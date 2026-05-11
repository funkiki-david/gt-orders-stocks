CREATE TYPE "Role" AS ENUM ('ADMIN', 'MANAGER', 'WAREHOUSE');
CREATE TYPE "SKUStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'DISCONTINUED');
CREATE TYPE "SOStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'SHIPPED', 'COMPLETED', 'CANCELLED');
CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'RELEASED', 'CANCELLED');
CREATE TYPE "MovementType" AS ENUM ('INBOUND', 'OUTBOUND', 'ADJUSTMENT', 'TRANSFER');
CREATE TYPE "ReferenceType" AS ENUM ('SALES_ORDER', 'PHYSICAL_COUNT', 'OTHER', 'TRANSFER_WH_LOCATION');

CREATE TABLE "users" (
  "id" TEXT PRIMARY KEY,
  "email" TEXT NOT NULL UNIQUE,
  "password" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "role" "Role" NOT NULL DEFAULT 'MANAGER',
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "customers" (
  "id" TEXT PRIMARY KEY,
  "companyName" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "billingAddress" TEXT,
  "notes" TEXT,
  "paymentTerms" TEXT NOT NULL DEFAULT 'Net 30',
  "active" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "skus" (
  "id" TEXT PRIMARY KEY,
  "skuCode" TEXT NOT NULL UNIQUE,
  "productName" TEXT NOT NULL,
  "description" TEXT,
  "category" TEXT NOT NULL,
  "unit" TEXT NOT NULL DEFAULT 'piece',
  "unitCost" DECIMAL(10,2) NOT NULL,
  "sellingPrice" DECIMAL(10,2) NOT NULL,
  "quantityOnHand" INTEGER NOT NULL DEFAULT 0,
  "quantityReserved" INTEGER NOT NULL DEFAULT 0,
  "reorderLevel" INTEGER NOT NULL DEFAULT 100,
  "reorderQuantity" INTEGER NOT NULL DEFAULT 500,
  "warehouseLocation" TEXT,
  "status" "SKUStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "warehouses" (
  "id" TEXT PRIMARY KEY,
  "code" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "isPalletTracked" BOOLEAN NOT NULL DEFAULT FALSE,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "pallet_locations" (
  "id" TEXT PRIMARY KEY,
  "warehouseId" TEXT NOT NULL REFERENCES "warehouses"("id"),
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "zone" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  UNIQUE ("warehouseId", "code")
);

CREATE TABLE "inventory_balances" (
  "id" TEXT PRIMARY KEY,
  "skuId" TEXT NOT NULL REFERENCES "skus"("id"),
  "warehouseId" TEXT NOT NULL REFERENCES "warehouses"("id"),
  "palletLocationId" TEXT REFERENCES "pallet_locations"("id"),
  "quantityOnHand" INTEGER NOT NULL DEFAULT 0,
  "quantityReserved" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "pallet_stock_references" (
  "id" TEXT PRIMARY KEY,
  "warehouseId" TEXT NOT NULL REFERENCES "warehouses"("id"),
  "palletLocationId" TEXT NOT NULL REFERENCES "pallet_locations"("id"),
  "skuId" TEXT REFERENCES "skus"("id"),
  "skuCode" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "count" INTEGER NOT NULL,
  "sourceName" TEXT NOT NULL,
  "notes" TEXT,
  "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "sales_orders" (
  "id" TEXT PRIMARY KEY,
  "soNumber" TEXT NOT NULL UNIQUE,
  "customerId" TEXT NOT NULL REFERENCES "customers"("id"),
  "orderDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" "SOStatus" NOT NULL DEFAULT 'DRAFT',
  "subtotalAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "shippingCharge" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "totalAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "notes" TEXT,
  "createdBy" TEXT NOT NULL REFERENCES "users"("id"),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "so_line_items" (
  "id" TEXT PRIMARY KEY,
  "soId" TEXT NOT NULL REFERENCES "sales_orders"("id") ON DELETE CASCADE,
  "skuId" TEXT NOT NULL REFERENCES "skus"("id"),
  "productDescription" TEXT,
  "quantityOrdered" INTEGER NOT NULL,
  "unitPrice" DECIMAL(10,2) NOT NULL,
  "lineTotal" DECIMAL(12,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "inventory_reservations" (
  "id" TEXT PRIMARY KEY,
  "skuId" TEXT NOT NULL REFERENCES "skus"("id"),
  "soId" TEXT NOT NULL REFERENCES "sales_orders"("id") ON DELETE CASCADE,
  "quantityReserved" INTEGER NOT NULL,
  "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  UNIQUE ("soId", "skuId")
);

CREATE TABLE "inventory_movements" (
  "id" TEXT PRIMARY KEY,
  "skuId" TEXT NOT NULL REFERENCES "skus"("id"),
  "movementType" "MovementType" NOT NULL,
  "quantity" INTEGER NOT NULL,
  "warehouseId" TEXT REFERENCES "warehouses"("id"),
  "fromWarehouseId" TEXT REFERENCES "warehouses"("id"),
  "toWarehouseId" TEXT REFERENCES "warehouses"("id"),
  "palletLocationId" TEXT REFERENCES "pallet_locations"("id"),
  "fromPalletLocationId" TEXT REFERENCES "pallet_locations"("id"),
  "toPalletLocationId" TEXT REFERENCES "pallet_locations"("id"),
  "referenceType" "ReferenceType",
  "referenceId" TEXT,
  "reason" TEXT,
  "notes" TEXT,
  "createdBy" TEXT NOT NULL REFERENCES "users"("id"),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "audit_logs" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "users"("id"),
  "action" TEXT NOT NULL,
  "tableName" TEXT NOT NULL,
  "recordId" TEXT NOT NULL,
  "soId" TEXT REFERENCES "sales_orders"("id") ON DELETE SET NULL,
  "changes" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "skus_status_idx" ON "skus"("status");
CREATE INDEX "sales_orders_customerId_idx" ON "sales_orders"("customerId");
CREATE INDEX "sales_orders_status_idx" ON "sales_orders"("status");
CREATE INDEX "sales_orders_orderDate_idx" ON "sales_orders"("orderDate");
CREATE INDEX "so_line_items_soId_idx" ON "so_line_items"("soId");
CREATE INDEX "so_line_items_skuId_idx" ON "so_line_items"("skuId");
CREATE INDEX "inventory_reservations_skuId_idx" ON "inventory_reservations"("skuId");
CREATE INDEX "inventory_reservations_status_idx" ON "inventory_reservations"("status");
CREATE INDEX "inventory_movements_skuId_idx" ON "inventory_movements"("skuId");
CREATE INDEX "inventory_movements_createdAt_idx" ON "inventory_movements"("createdAt");
CREATE INDEX "inventory_movements_reference_idx" ON "inventory_movements"("referenceType", "referenceId");
CREATE INDEX "inventory_balances_skuId_idx" ON "inventory_balances"("skuId");
CREATE INDEX "inventory_balances_warehouseId_idx" ON "inventory_balances"("warehouseId");
CREATE INDEX "inventory_balances_palletLocationId_idx" ON "inventory_balances"("palletLocationId");
CREATE INDEX "pallet_stock_references_warehouseId_idx" ON "pallet_stock_references"("warehouseId");
CREATE INDEX "pallet_stock_references_palletLocationId_idx" ON "pallet_stock_references"("palletLocationId");
CREATE INDEX "pallet_stock_references_skuId_idx" ON "pallet_stock_references"("skuId");
CREATE INDEX "pallet_stock_references_skuCode_idx" ON "pallet_stock_references"("skuCode");
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");
CREATE INDEX "audit_logs_recordId_idx" ON "audit_logs"("recordId");
CREATE INDEX "audit_logs_tableName_idx" ON "audit_logs"("tableName");
