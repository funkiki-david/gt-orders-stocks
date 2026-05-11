import { db } from "../config/db.js";

export async function ensureOrderSchema() {
  await db.query(`
    alter table sales_orders
      add column if not exists "subtotalAmount" decimal(12,2) not null default 0,
      add column if not exists "shippingCharge" decimal(12,2) not null default 0
  `);

  await db.query(`
    alter table so_line_items
      add column if not exists "productDescription" text
  `);

  await db.query(`
    update sales_orders
    set "subtotalAmount" = "totalAmount"
    where "subtotalAmount" = 0 and "totalAmount" <> 0
  `);
}
