export type InventoryItem = {
  sku: string;
  name: string;
  category: string;
  qty: number;
  palletLocation?: string;
};

export type Customer = {
  name: string;
  orders: number;
  total: number;
  payment: string;
  salesRep: string;
  lastOrder: string;
};

export type SalesOrderLineItem = {
  sku: string;
  description: string;
  width: string;
  length: string;
  category: string;
  qty: number;
  unitPrice: number;
  total: number;
};

export type SalesOrder = {
  invoice: string;
  date: string;
  shipDate: string;
  customer: string;
  po: string;
  payment: string;
  shipMethod: string;
  shipCost: string;
  salesRep: string;
  items: SalesOrderLineItem[];
  totalQty: number;
  subtotal: number;
};
