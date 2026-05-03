import { randomUUID } from "node:crypto";
import { db } from "../../config/db.js";
import { AppError } from "../../shared/errors.js";

type CustomerRow = {
  id: string;
  companyName: string;
  email: string | null;
  phone: string | null;
  billingAddress: string | null;
  notes: string | null;
  paymentTerms: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type CustomerSummaryRow = {
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

function toCustomerResponse(row: CustomerRow) {
  return row;
}

export const customersService = {
  async list(input: { page: number; pageSize: number; search?: string }) {
    const params: Array<string | number> = [];
    const conditions: string[] = [`active = true`];

    if (input.search) {
      params.push(`%${input.search}%`);
      conditions.push(`("companyName" ilike $${params.length} or coalesce(email, '') ilike $${params.length})`);
    }

    const whereClause = `where ${conditions.join(" and ")}`;
    const offset = (input.page - 1) * input.pageSize;
    const listParams = [...params, input.pageSize, offset];

    const [itemsResult, totalResult] = await Promise.all([
      db.query(
        `
          select *
          from customers
          ${whereClause}
          order by "companyName" asc
          limit $${listParams.length - 1}
          offset $${listParams.length}
        `,
        listParams,
      ),
      db.query(`select count(*)::int as total from customers ${whereClause}`, params),
    ]);

    return {
      items: itemsResult.rows.map((row) => toCustomerResponse(row as CustomerRow)),
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        total: totalResult.rows[0].total,
      },
    };
  },

  async getById(id: string) {
    const result = await db.query(`select * from customers where id = $1 limit 1`, [id]);
    const customer = result.rows[0] as CustomerRow | undefined;

    if (!customer || !customer.active) {
      throw new AppError("Customer not found", 404);
    }

    return toCustomerResponse(customer);
  },

  async summary(id: string) {
    const customer = await this.getById(id);

    const result = await db.query(
      `
        select
          count(*)::int as "totalOrders",
          coalesce(sum("totalAmount"), 0)::numeric(12,2)::text as "totalAmount",
          count(*) filter (where status = 'DRAFT')::int as "draftOrders",
          coalesce(sum("totalAmount") filter (where status = 'DRAFT'), 0)::numeric(12,2)::text as "draftAmount",
          count(*) filter (where status = 'CONFIRMED')::int as "confirmedOrders",
          coalesce(sum("totalAmount") filter (where status = 'CONFIRMED'), 0)::numeric(12,2)::text as "confirmedAmount",
          count(*) filter (where status = 'SHIPPED')::int as "shippedOrders",
          coalesce(sum("totalAmount") filter (where status = 'SHIPPED'), 0)::numeric(12,2)::text as "shippedAmount",
          count(*) filter (where status = 'CANCELLED')::int as "cancelledOrders",
          coalesce(sum("totalAmount") filter (where status = 'CANCELLED'), 0)::numeric(12,2)::text as "cancelledAmount"
        from sales_orders
        where "customerId" = $1
      `,
      [customer.id],
    );

    return result.rows[0] as CustomerSummaryRow;
  },

  async create(input: {
    companyName: string;
    email?: string;
    phone?: string;
    billingAddress?: string;
    notes?: string;
    paymentTerms: string;
  }) {
    const result = await db.query(
      `
        insert into customers (
          "id", "companyName", "email", "phone", "billingAddress", "notes", "paymentTerms", "updatedAt"
        )
        values ($1, $2, $3, $4, $5, $6, $7, now())
        returning *
      `,
      [
        randomUUID(),
        input.companyName,
        input.email ?? null,
        input.phone ?? null,
        input.billingAddress ?? null,
        input.notes ?? null,
        input.paymentTerms,
      ],
    );

    return toCustomerResponse(result.rows[0] as CustomerRow);
  },

  async update(
    id: string,
    input: Partial<{
      companyName: string;
      email?: string;
      phone?: string;
      billingAddress?: string;
      notes?: string;
      paymentTerms: string;
    }>,
  ) {
    const existingResult = await db.query(`select * from customers where id = $1 limit 1`, [id]);
    const existing = existingResult.rows[0] as CustomerRow | undefined;

    if (!existing || !existing.active) {
      throw new AppError("Customer not found", 404);
    }

    const merged = {
      companyName: input.companyName ?? existing.companyName,
      email: input.email ?? existing.email,
      phone: input.phone ?? existing.phone,
      billingAddress: input.billingAddress ?? existing.billingAddress,
      notes: input.notes ?? existing.notes,
      paymentTerms: input.paymentTerms ?? existing.paymentTerms,
    };

    const result = await db.query(
      `
        update customers
        set
          "companyName" = $2,
          "email" = $3,
          "phone" = $4,
          "billingAddress" = $5,
          "notes" = $6,
          "paymentTerms" = $7,
          "updatedAt" = now()
        where id = $1
        returning *
      `,
      [id, merged.companyName, merged.email, merged.phone, merged.billingAddress, merged.notes, merged.paymentTerms],
    );

    return toCustomerResponse(result.rows[0] as CustomerRow);
  },
};
