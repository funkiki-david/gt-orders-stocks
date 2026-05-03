import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { db } from "../../config/db.js";
import { AppError } from "../../shared/errors.js";

type OrderStatus = "DRAFT" | "CONFIRMED" | "SHIPPED" | "COMPLETED" | "CANCELLED";
type OrderSortBy = "updatedAt" | "orderDate" | "totalAmount" | "soNumber" | "customerName";
type SortDirection = "asc" | "desc";

type OrderLineInput = {
  skuId: string;
  quantityOrdered: number;
  unitPrice: number;
};

type SalesOrderRow = {
  id: string;
  soNumber: string;
  customerId: string;
  orderDate: Date;
  status: OrderStatus;
  totalAmount: string | number;
  notes: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  customerCompanyName?: string;
  customerPaymentTerms?: string | null;
  createdByName?: string;
};

type OrderLineRow = {
  id: string;
  soId: string;
  skuId: string;
  quantityOrdered: number;
  unitPrice: string | number;
  lineTotal: string | number;
  createdAt: Date;
  updatedAt: Date;
  skuCode?: string;
  productName?: string;
};

type ReservationRow = {
  id: string;
  soId: string;
  skuId: string;
  quantityReserved: number;
  status: "ACTIVE" | "RELEASED" | "CANCELLED";
  createdAt: Date;
  updatedAt: Date;
  skuCode?: string;
  productName?: string;
};

type AuditLogRow = {
  id: string;
  userId: string;
  action: string;
  tableName: string;
  recordId: string;
  soId: string | null;
  changes: Record<string, unknown> | null;
  createdAt: Date;
  userName?: string;
};

function toOrderLineResponse(line: OrderLineRow) {
  return {
    ...line,
    unitPrice: String(line.unitPrice),
    lineTotal: String(line.lineTotal),
    skuCode: line.skuCode ?? undefined,
    productName: line.productName ?? undefined,
  };
}

function toReservationResponse(row: ReservationRow) {
  return {
    ...row,
    skuCode: row.skuCode ?? undefined,
    productName: row.productName ?? undefined,
  };
}

function toOrderSummary(row: SalesOrderRow) {
  return {
    id: row.id,
    soNumber: row.soNumber,
    customerId: row.customerId,
    customerCompanyName: row.customerCompanyName ?? undefined,
    customerPaymentTerms: row.customerPaymentTerms ?? undefined,
    orderDate: row.orderDate,
    status: row.status,
    totalAmount: String(row.totalAmount),
    notes: row.notes ?? undefined,
    createdBy: row.createdBy,
    createdByName: row.createdByName ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toAuditEntry(row: AuditLogRow) {
  return {
    id: row.id,
    userId: row.userId,
    userName: row.userName ?? undefined,
    action: row.action,
    tableName: row.tableName,
    recordId: row.recordId,
    soId: row.soId ?? undefined,
    changes: row.changes ?? undefined,
    createdAt: row.createdAt,
  };
}

async function insertAuditLog(
  client: PoolClient,
  input: {
    userId: string;
    action: string;
    tableName: string;
    recordId: string;
    soId?: string;
    changes?: Record<string, unknown>;
  },
) {
  await client.query(
    `
      insert into audit_logs ("id", "userId", "action", "tableName", "recordId", "soId", "changes")
      values ($1, $2, $3, $4, $5, $6, $7::jsonb)
    `,
    [
      randomUUID(),
      input.userId,
      input.action,
      input.tableName,
      input.recordId,
      input.soId ?? null,
      input.changes ? JSON.stringify(input.changes) : null,
    ],
  );
}

async function ensureCustomerExists(client: PoolClient, customerId: string) {
  const customerResult = await client.query(
    `select id, "companyName", "paymentTerms" from customers where id = $1 and active = true limit 1`,
    [customerId],
  );

  if (!customerResult.rowCount) {
    throw new AppError("Customer not found", 404);
  }

  return customerResult.rows[0];
}

async function validateDraftLines(client: PoolClient, lines: OrderLineInput[]) {
  for (const line of lines) {
    const skuResult = await client.query(
      `
        select id, "skuCode", "productName", status
        from skus
        where id = $1
        limit 1
      `,
      [line.skuId],
    );

    if (!skuResult.rowCount) {
      throw new AppError(`SKU not found: ${line.skuId}`, 404);
    }

    if (skuResult.rows[0].status !== "ACTIVE") {
      throw new AppError(`SKU is not active: ${skuResult.rows[0].skuCode}`, 400);
    }
  }
}

async function ensureDraftOrderForLineEdit(client: PoolClient, soId: string) {
  const orderResult = await client.query(`select * from sales_orders where id = $1 limit 1 for update`, [soId]);
  const order = orderResult.rows[0] as SalesOrderRow | undefined;

  if (!order) {
    throw new AppError("Sales order not found", 404);
  }

  if (order.status !== "DRAFT") {
    throw new AppError("Only draft sales orders can be edited", 400);
  }

  return order;
}

function calculateTotal(lines: OrderLineInput[]) {
  return lines.reduce((sum, line) => sum + line.quantityOrdered * line.unitPrice, 0);
}

async function createOrderLines(client: PoolClient, soId: string, lines: OrderLineInput[]) {
  for (const line of lines) {
    await client.query(
      `
        insert into so_line_items (
          "id", "soId", "skuId", "quantityOrdered", "unitPrice", "lineTotal", "updatedAt"
        )
        values ($1, $2, $3, $4, $5, $6, now())
      `,
      [
        randomUUID(),
        soId,
        line.skuId,
        line.quantityOrdered,
        line.unitPrice,
        line.quantityOrdered * line.unitPrice,
      ],
    );
  }
}

async function getOrderDetail(id: string) {
  const orderResult = await db.query(
    `
      select
        so.*,
        c."companyName" as "customerCompanyName",
        c."paymentTerms" as "customerPaymentTerms",
        u."name" as "createdByName"
      from sales_orders so
      join customers c on c.id = so."customerId"
      join users u on u.id = so."createdBy"
      where so.id = $1
      limit 1
    `,
    [id],
  );
  const order = orderResult.rows[0] as SalesOrderRow | undefined;

  if (!order) {
    throw new AppError("Sales order not found", 404);
  }

  const [linesResult, reservationsResult] = await Promise.all([
    db.query(
      `
        select
          li.*,
          s."skuCode" as "skuCode",
          s."productName" as "productName"
        from so_line_items li
        join skus s on s.id = li."skuId"
        where li."soId" = $1
        order by li."createdAt" asc
      `,
      [id],
    ),
    db.query(
      `
        select
          r.*,
          s."skuCode" as "skuCode",
          s."productName" as "productName"
        from inventory_reservations r
        join skus s on s.id = r."skuId"
        where r."soId" = $1
        order by r."createdAt" asc
      `,
      [id],
    ),
  ]);

  return {
    ...toOrderSummary(order),
    lines: linesResult.rows.map((row) => toOrderLineResponse(row as OrderLineRow)),
    reservations: reservationsResult.rows.map((row) => toReservationResponse(row as ReservationRow)),
  };
}

async function nextSoNumber(client: PoolClient) {
  const year = new Date().getFullYear();
  const countResult = await client.query(
    `select count(*)::int as total from sales_orders where extract(year from "createdAt") = $1`,
    [year],
  );
  const next = countResult.rows[0].total + 1;
  return `SO-${year}-${String(next).padStart(4, "0")}`;
}

export const ordersService = {
  async list(input: {
    page: number;
    pageSize: number;
    search?: string;
    status?: OrderStatus;
    customerId?: string;
    skuId?: string;
    dateFrom?: string;
    dateTo?: string;
    sortBy: OrderSortBy;
    sortDirection: SortDirection;
  }) {
    const params: Array<string | number> = [];
    const conditions: string[] = [];
    const orderByMap: Record<OrderSortBy, string> = {
      updatedAt: `so."updatedAt"`,
      orderDate: `so."orderDate"`,
      totalAmount: `so."totalAmount"`,
      soNumber: `so."soNumber"`,
      customerName: `c."companyName"`,
    };
    const orderByClause = `${orderByMap[input.sortBy]} ${input.sortDirection}, so."createdAt" desc`;

    if (input.status) {
      params.push(input.status);
      conditions.push(`so."status" = $${params.length}`);
    }

    if (input.customerId) {
      params.push(input.customerId);
      conditions.push(`so."customerId" = $${params.length}`);
    }

    if (input.skuId) {
      params.push(input.skuId);
      conditions.push(
        `exists (select 1 from so_line_items li where li."soId" = so.id and li."skuId" = $${params.length})`,
      );
    }

    if (input.search) {
      params.push(`%${input.search}%`);
      conditions.push(`(so."soNumber" ilike $${params.length} or c."companyName" ilike $${params.length})`);
    }

    if (input.dateFrom) {
      params.push(input.dateFrom);
      conditions.push(`so."orderDate"::date >= $${params.length}`);
    }

    if (input.dateTo) {
      params.push(input.dateTo);
      conditions.push(`so."orderDate"::date <= $${params.length}`);
    }

    const whereClause = conditions.length ? `where ${conditions.join(" and ")}` : "";
    const offset = (input.page - 1) * input.pageSize;
    const listParams = [...params, input.pageSize, offset];

    const [itemsResult, totalResult] = await Promise.all([
      db.query(
        `
          select
            so.*,
            c."companyName" as "customerCompanyName",
            c."paymentTerms" as "customerPaymentTerms",
            u."name" as "createdByName"
          from sales_orders so
          join customers c on c.id = so."customerId"
          join users u on u.id = so."createdBy"
          ${whereClause}
          order by ${orderByClause}
          limit $${listParams.length - 1}
          offset $${listParams.length}
        `,
        listParams,
      ),
      db.query(
        `
          select count(*)::int as total
          from sales_orders so
          join customers c on c.id = so."customerId"
          ${whereClause}
        `,
        params,
      ),
    ]);

    return {
      items: itemsResult.rows.map((row) => toOrderSummary(row as SalesOrderRow)),
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        total: totalResult.rows[0].total,
      },
    };
  },

  async getById(id: string) {
    return getOrderDetail(id);
  },

  async activity(id: string, page: number, pageSize: number) {
    const order = await db.query(`select id from sales_orders where id = $1 limit 1`, [id]);

    if (!order.rowCount) {
      throw new AppError("Sales order not found", 404);
    }

    const offset = (page - 1) * pageSize;
    const [itemsResult, totalResult] = await Promise.all([
      db.query(
        `
          select
            a.*,
            u."name" as "userName"
          from audit_logs a
          join users u on u.id = a."userId"
          where a."soId" = $1
          order by a."createdAt" desc
          limit $2
          offset $3
        `,
        [id, pageSize, offset],
      ),
      db.query(`select count(*)::int as total from audit_logs where "soId" = $1`, [id]),
    ]);

    return {
      items: itemsResult.rows.map((row) => toAuditEntry(row as AuditLogRow)),
      pagination: {
        page,
        pageSize,
        total: totalResult.rows[0].total,
      },
    };
  },

  async create(
    input: {
      customerId: string;
      orderDate?: string;
      notes?: string;
      lines: OrderLineInput[];
    },
    userId: string,
  ) {
    const client = await db.connect();

    try {
      await client.query("begin");

      await ensureCustomerExists(client, input.customerId);
      await validateDraftLines(client, input.lines);

      const soId = randomUUID();
      const soNumber = await nextSoNumber(client);
      const totalAmount = calculateTotal(input.lines);

      await client.query(
        `
          insert into sales_orders (
            "id", "soNumber", "customerId", "orderDate", "status",
            "totalAmount", "notes", "createdBy", "updatedAt"
          )
          values ($1, $2, $3, $4, 'DRAFT', $5, $6, $7, now())
        `,
        [
          soId,
          soNumber,
          input.customerId,
          input.orderDate ? new Date(input.orderDate) : new Date(),
          totalAmount,
          input.notes ?? null,
          userId,
        ],
      );

      await createOrderLines(client, soId, input.lines);

      await insertAuditLog(client, {
        userId,
        action: "CREATE_SO",
        tableName: "sales_orders",
        recordId: soId,
        soId,
        changes: {
          soNumber,
          status: "DRAFT",
          totalAmount,
          lines: input.lines.length,
        },
      });

      await client.query("commit");

      return getOrderDetail(soId);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  },

  async update(
    id: string,
    input: {
      customerId?: string;
      orderDate?: string;
      notes?: string;
      lines?: OrderLineInput[];
    },
    userId: string,
  ) {
    const client = await db.connect();

    try {
      await client.query("begin");

      const orderResult = await client.query(`select * from sales_orders where id = $1 limit 1 for update`, [id]);
      const order = orderResult.rows[0] as SalesOrderRow | undefined;

      if (!order) {
        throw new AppError("Sales order not found", 404);
      }

      if (order.status !== "DRAFT") {
        throw new AppError("Only draft sales orders can be edited", 400);
      }

      const nextCustomerId = input.customerId ?? order.customerId;
      await ensureCustomerExists(client, nextCustomerId);

      let totalAmount = Number(order.totalAmount);
      if (input.lines) {
        await validateDraftLines(client, input.lines);
        totalAmount = calculateTotal(input.lines);

        await client.query(`delete from so_line_items where "soId" = $1`, [id]);
        await createOrderLines(client, id, input.lines);
      }

      await client.query(
        `
          update sales_orders
          set
            "customerId" = $2,
            "orderDate" = $3,
            "notes" = $4,
            "totalAmount" = $5,
            "updatedAt" = now()
          where id = $1
        `,
        [
          id,
          nextCustomerId,
          input.orderDate ? new Date(input.orderDate) : order.orderDate,
          input.notes ?? order.notes,
          totalAmount,
        ],
      );

      await insertAuditLog(client, {
        userId,
        action: "UPDATE_SO",
        tableName: "sales_orders",
        recordId: id,
        soId: id,
        changes: {
          totalAmount,
          lineCount: input.lines?.length,
        },
      });

      await client.query("commit");

      return getOrderDetail(id);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  },

  async remove(id: string, userId: string) {
    const client = await db.connect();

    try {
      await client.query("begin");

      const orderResult = await client.query(`select * from sales_orders where id = $1 limit 1 for update`, [id]);
      const order = orderResult.rows[0] as SalesOrderRow | undefined;

      if (!order) {
        throw new AppError("Sales order not found", 404);
      }

      if (order.status !== "DRAFT") {
        throw new AppError("Only draft sales orders can be deleted", 400);
      }

      await client.query(`delete from sales_orders where id = $1`, [id]);

      await insertAuditLog(client, {
        userId,
        action: "DELETE_SO",
        tableName: "sales_orders",
        recordId: id,
        soId: id,
      });

      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  },

  async confirm(id: string, userId: string) {
    const client = await db.connect();

    try {
      await client.query("begin");

      const orderResult = await client.query(`select * from sales_orders where id = $1 limit 1 for update`, [id]);
      const order = orderResult.rows[0] as SalesOrderRow | undefined;

      if (!order) {
        throw new AppError("Sales order not found", 404);
      }

      if (order.status !== "DRAFT") {
        throw new AppError("Only draft sales orders can be confirmed", 400);
      }

      const linesResult = await client.query(
        `
          select li.*, s."skuCode", s."productName", s."quantityOnHand", s."quantityReserved", s."status"
          from so_line_items li
          join skus s on s.id = li."skuId"
          where li."soId" = $1
          order by li."createdAt" asc
          for update of s
        `,
        [id],
      );

      if (!linesResult.rowCount) {
        throw new AppError("Sales order must have at least one line before confirmation", 400);
      }

      for (const line of linesResult.rows) {
        if (line.status !== "ACTIVE") {
          throw new AppError(`SKU is not active: ${line.skuCode}`, 400);
        }

        const available = line.quantityOnHand - line.quantityReserved;
        if (line.quantityOrdered > available) {
          throw new AppError(
            `Insufficient available stock for ${line.skuCode}. Requested ${line.quantityOrdered}, available ${available}`,
            400,
          );
        }
      }

      for (const line of linesResult.rows) {
        await client.query(
          `
            insert into inventory_reservations (
              "id", "skuId", "soId", "quantityReserved", "status", "updatedAt"
            )
            values ($1, $2, $3, $4, 'ACTIVE', now())
          `,
          [randomUUID(), line.skuId, id, line.quantityOrdered],
        );

        await client.query(
          `
            update skus
            set "quantityReserved" = "quantityReserved" + $2, "updatedAt" = now()
            where id = $1
          `,
          [line.skuId, line.quantityOrdered],
        );
      }

      await client.query(
        `update sales_orders set "status" = 'CONFIRMED', "updatedAt" = now() where id = $1`,
        [id],
      );

      await insertAuditLog(client, {
        userId,
        action: "CONFIRM_SO",
        tableName: "sales_orders",
        recordId: id,
        soId: id,
        changes: {
          from: "DRAFT",
          to: "CONFIRMED",
          reservationsCreated: linesResult.rowCount,
        },
      });

      await client.query("commit");

      return getOrderDetail(id);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  },

  async cancel(id: string, userId: string, reason?: string) {
    const client = await db.connect();

    try {
      await client.query("begin");

      const orderResult = await client.query(`select * from sales_orders where id = $1 limit 1 for update`, [id]);
      const order = orderResult.rows[0] as SalesOrderRow | undefined;

      if (!order) {
        throw new AppError("Sales order not found", 404);
      }

      if (order.status !== "DRAFT" && order.status !== "CONFIRMED") {
        throw new AppError("Only draft or confirmed sales orders can be cancelled", 400);
      }

      if (order.status === "CONFIRMED") {
        const shipmentResult = await client.query(
          `
            select count(*)::int as total
            from inventory_movements
            where "referenceType" = 'SALES_ORDER'
              and "referenceId" = $1
              and "movementType" = 'OUTBOUND'
          `,
          [id],
        );

        if (shipmentResult.rows[0].total > 0) {
          throw new AppError(
            "Confirmed sales order cannot be cancelled after linked outbound shipment has started",
            400,
          );
        }

        const reservationsResult = await client.query(
          `
            select *
            from inventory_reservations
            where "soId" = $1 and "status" = 'ACTIVE'
            for update
          `,
          [id],
        );

        for (const reservation of reservationsResult.rows as ReservationRow[]) {
          await client.query(
            `
              update skus
              set "quantityReserved" = "quantityReserved" - $2, "updatedAt" = now()
              where id = $1
            `,
            [reservation.skuId, reservation.quantityReserved],
          );
        }

        await client.query(
          `
            update inventory_reservations
            set "quantityReserved" = 0, "status" = 'CANCELLED', "updatedAt" = now()
            where "soId" = $1 and "status" = 'ACTIVE'
          `,
          [id],
        );
      }

      await client.query(
        `update sales_orders set "status" = 'CANCELLED', "updatedAt" = now() where id = $1`,
        [id],
      );

      await insertAuditLog(client, {
        userId,
        action: "CANCEL_SO",
        tableName: "sales_orders",
        recordId: id,
        soId: id,
        changes: {
          from: order.status,
          to: "CANCELLED",
          reason,
        },
      });

      await client.query("commit");

      return getOrderDetail(id);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  },

  async addLine(id: string, input: OrderLineInput, userId: string) {
    const client = await db.connect();

    try {
      await client.query("begin");

      await ensureDraftOrderForLineEdit(client, id);
      await validateDraftLines(client, [input]);
      await createOrderLines(client, id, [input]);

      const totalResult = await client.query(
        `select coalesce(sum("lineTotal"), 0)::numeric(12,2) as total from so_line_items where "soId" = $1`,
        [id],
      );

      await client.query(
        `update sales_orders set "totalAmount" = $2, "updatedAt" = now() where id = $1`,
        [id, totalResult.rows[0].total],
      );

      await insertAuditLog(client, {
        userId,
        action: "ADD_SO_LINE",
        tableName: "so_line_items",
        recordId: id,
        soId: id,
        changes: input,
      });

      await client.query("commit");
      return getOrderDetail(id);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  },

  async updateLine(
    soId: string,
    lineId: string,
    input: Partial<OrderLineInput>,
    userId: string,
  ) {
    const client = await db.connect();

    try {
      await client.query("begin");

      await ensureDraftOrderForLineEdit(client, soId);

      const lineResult = await client.query(
        `select * from so_line_items where id = $1 and "soId" = $2 limit 1 for update`,
        [lineId, soId],
      );
      const line = lineResult.rows[0] as OrderLineRow | undefined;

      if (!line) {
        throw new AppError("Sales order line not found", 404);
      }

      const merged: OrderLineInput = {
        skuId: input.skuId ?? line.skuId,
        quantityOrdered: input.quantityOrdered ?? line.quantityOrdered,
        unitPrice: input.unitPrice ?? Number(line.unitPrice),
      };

      await validateDraftLines(client, [merged]);

      await client.query(
        `
          update so_line_items
          set
            "skuId" = $3,
            "quantityOrdered" = $4,
            "unitPrice" = $5,
            "lineTotal" = $6,
            "updatedAt" = now()
          where id = $1 and "soId" = $2
        `,
        [lineId, soId, merged.skuId, merged.quantityOrdered, merged.unitPrice, merged.quantityOrdered * merged.unitPrice],
      );

      const totalResult = await client.query(
        `select coalesce(sum("lineTotal"), 0)::numeric(12,2) as total from so_line_items where "soId" = $1`,
        [soId],
      );

      await client.query(
        `update sales_orders set "totalAmount" = $2, "updatedAt" = now() where id = $1`,
        [soId, totalResult.rows[0].total],
      );

      await insertAuditLog(client, {
        userId,
        action: "UPDATE_SO_LINE",
        tableName: "so_line_items",
        recordId: lineId,
        soId,
        changes: merged,
      });

      await client.query("commit");
      return getOrderDetail(soId);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  },

  async deleteLine(soId: string, lineId: string, userId: string) {
    const client = await db.connect();

    try {
      await client.query("begin");

      await ensureDraftOrderForLineEdit(client, soId);

      const deleted = await client.query(
        `delete from so_line_items where id = $1 and "soId" = $2 returning id`,
        [lineId, soId],
      );

      if (!deleted.rowCount) {
        throw new AppError("Sales order line not found", 404);
      }

      const totalResult = await client.query(
        `select coalesce(sum("lineTotal"), 0)::numeric(12,2) as total, count(*)::int as count from so_line_items where "soId" = $1`,
        [soId],
      );

      if (totalResult.rows[0].count === 0) {
        throw new AppError("Sales order must retain at least one line item", 400);
      }

      await client.query(
        `update sales_orders set "totalAmount" = $2, "updatedAt" = now() where id = $1`,
        [soId, totalResult.rows[0].total],
      );

      await insertAuditLog(client, {
        userId,
        action: "DELETE_SO_LINE",
        tableName: "so_line_items",
        recordId: lineId,
        soId,
      });

      await client.query("commit");
      return getOrderDetail(soId);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  },
};
