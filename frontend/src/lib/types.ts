export type Pagination = {
  page: number;
  pageSize: number;
  total: number;
};

export type Customer = {
  id: string;
  companyName: string;
  email?: string | null;
  phone?: string | null;
  billingAddress?: string | null;
  notes?: string | null;
  paymentTerms: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type UserAccount = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "MANAGER" | "WAREHOUSE";
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CustomerSalesSummary = {
  totalOrders: number;
  totalAmount: string;
  draftOrders: number;
  draftAmount: string;
  confirmedOrders: number;
  confirmedAmount: string;
  shippedOrders: number;
  shippedAmount: string;
  cancelledOrders: number;
  cancelledAmount: string;
};

export type Sku = {
  id: string;
  skuCode: string;
  productName: string;
  description?: string | null;
  category: string;
  unit: string;
  unitCost: string;
  sellingPrice: string;
  quantityOnHand: number;
  quantityReserved: number;
  reorderLevel: number;
  reorderQuantity: number;
  warehouseLocation?: string | null;
  status: "ACTIVE" | "INACTIVE" | "DISCONTINUED";
  createdAt: string;
  updatedAt: string;
  available: number;
};

export type InventoryMovement = {
  id: string;
  skuId: string;
  skuCode?: string;
  productName?: string;
  movementType: "INBOUND" | "OUTBOUND" | "ADJUSTMENT" | "TRANSFER";
  quantity: number;
  warehouseId?: string;
  fromWarehouseId?: string;
  toWarehouseId?: string;
  palletLocationId?: string;
  fromPalletLocationId?: string;
  toPalletLocationId?: string;
  referenceType?: "SALES_ORDER" | "PHYSICAL_COUNT" | "OTHER" | "TRANSFER_WH_LOCATION";
  referenceId?: string;
  reason?: string;
  notes?: string;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
};

export type OrderLine = {
  id: string;
  soId: string;
  skuId: string;
  skuCode?: string;
  productName?: string;
  quantityOrdered: number;
  unitPrice: string;
  lineTotal: string;
  createdAt: string;
  updatedAt: string;
};

export type Reservation = {
  id: string;
  soId: string;
  skuId: string;
  skuCode?: string;
  productName?: string;
  quantityReserved: number;
  status: "ACTIVE" | "RELEASED" | "CANCELLED";
  createdAt: string;
  updatedAt: string;
};

export type SalesOrderSummary = {
  id: string;
  soNumber: string;
  customerId: string;
  customerCompanyName?: string;
  customerPaymentTerms?: string;
  orderDate: string;
  status: "DRAFT" | "CONFIRMED" | "SHIPPED" | "COMPLETED" | "CANCELLED";
  totalAmount: string;
  notes?: string;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
  updatedAt: string;
};

export type SalesOrderDetail = SalesOrderSummary & {
  lines: OrderLine[];
  reservations: Reservation[];
};

export type DashboardSummary = {
  metrics: {
    totalSkus: number;
    lowStockItems: number;
    totalInventoryValue: string;
    todayMovementCount: number;
  };
  recentMovements: InventoryMovement[];
};

export type Warehouse = {
  id: string;
  code: string;
  name: string;
  isPalletTracked: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PalletLocation = {
  id: string;
  warehouseId: string;
  warehouseCode?: string;
  warehouseName?: string;
  code: string;
  label: string;
  zone?: string;
  isActive: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type SkuLocationBalance = {
  id: string;
  skuId: string;
  warehouseId: string;
  warehouseCode?: string;
  warehouseName?: string;
  isPalletTracked: boolean;
  palletLocationId?: string;
  palletCode?: string;
  palletLabel?: string;
  palletZone?: string;
  quantityOnHand: number;
  quantityReserved: number;
  available: number;
  updatedAt: string;
};

export type PalletStockItem = {
  id: string;
  skuId: string;
  skuCode: string;
  productName: string;
  category: string;
  unit: string;
  quantityOnHand: number;
  quantityReserved: number;
  available: number;
  updatedAt: string;
};

export type ActivityEntry = {
  id: string;
  userId: string;
  userName?: string;
  action: string;
  tableName: string;
  recordId: string;
  soId?: string;
  changes?: Record<string, unknown>;
  createdAt: string;
};
