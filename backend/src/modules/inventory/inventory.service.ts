import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { db } from "../../config/db.js";
import { AppError } from "../../shared/errors.js";

type SkuRow = {
  id: string;
  skuCode: string;
  productName: string;
  description: string | null;
  category: string;
  unit: string;
  unitCost: string | number;
  sellingPrice: string | number;
  quantityOnHand: number;
  quantityReserved: number;
  reorderLevel: number;
  reorderQuantity: number;
  warehouseLocation: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

type MovementRow = {
  id: string;
  skuId: string;
  movementType: "INBOUND" | "OUTBOUND" | "ADJUSTMENT" | "TRANSFER";
  quantity: number;
  warehouseId?: string | null;
  fromWarehouseId?: string | null;
  toWarehouseId?: string | null;
  palletLocationId?: string | null;
  fromPalletLocationId?: string | null;
  toPalletLocationId?: string | null;
  referenceType: "SALES_ORDER" | "PHYSICAL_COUNT" | "OTHER" | "TRANSFER_WH_LOCATION" | null;
  referenceId: string | null;
  reason: string | null;
  notes: string | null;
  createdBy: string;
  createdAt: Date;
  skuCode?: string;
  productName?: string;
  createdByName?: string;
};

type ReservationRow = {
  id: string;
  soId: string;
  skuId: string;
  quantityReserved: number;
  status: "ACTIVE" | "RELEASED" | "CANCELLED";
};

type SalesOrderLinkRow = {
  id: string;
  soNumber: string;
  status: "DRAFT" | "CONFIRMED" | "SHIPPED" | "COMPLETED" | "CANCELLED";
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

type WarehouseRow = {
  id: string;
  code: string;
  name: string;
  isPalletTracked: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type PalletLocationRow = {
  id: string;
  warehouseId: string;
  code: string;
  label: string;
  zone: string | null;
  isActive: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  warehouseName?: string;
  warehouseCode?: string;
};

type InventoryBalanceRow = {
  id: string;
  skuId: string;
  warehouseId: string;
  palletLocationId: string | null;
  quantityOnHand: number;
  quantityReserved: number;
  updatedAt: Date;
  warehouseName?: string;
  warehouseCode?: string;
  isPalletTracked?: boolean;
  palletCode?: string | null;
  palletLabel?: string | null;
  palletZone?: string | null;
  skuCode?: string;
  productName?: string;
  category?: string;
  unit?: string;
};

type SkuSortBy =
  | "updatedAt"
  | "createdAt"
  | "skuCode"
  | "productName"
  | "quantityOnHand"
  | "available"
  | "reorderLevel";
type MovementSortBy = "createdAt" | "quantity" | "movementType";
type SortDirection = "asc" | "desc";

let infraReadyPromise: Promise<void> | null = null;

function toSkuResponse(sku: SkuRow) {
  return {
    ...sku,
    unitCost: String(sku.unitCost),
    sellingPrice: String(sku.sellingPrice),
    available: sku.quantityOnHand - sku.quantityReserved,
  };
}

function toMovementResponse(movement: MovementRow) {
  return {
    ...movement,
    referenceType: movement.referenceType ?? undefined,
    referenceId: movement.referenceId ?? undefined,
    reason: movement.reason ?? undefined,
    notes: movement.notes ?? undefined,
    skuCode: movement.skuCode ?? undefined,
    productName: movement.productName ?? undefined,
    createdByName: movement.createdByName ?? undefined,
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

function toWarehouseResponse(row: WarehouseRow) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    isPalletTracked: row.isPalletTracked,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toPalletLocationResponse(row: PalletLocationRow) {
  return {
    id: row.id,
    warehouseId: row.warehouseId,
    warehouseCode: row.warehouseCode ?? undefined,
    warehouseName: row.warehouseName ?? undefined,
    code: row.code,
    label: row.label,
    zone: row.zone ?? undefined,
    isActive: row.isActive,
    notes: row.notes ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toLocationBalanceResponse(row: InventoryBalanceRow) {
  return {
    id: row.id,
    skuId: row.skuId,
    warehouseId: row.warehouseId,
    warehouseCode: row.warehouseCode ?? undefined,
    warehouseName: row.warehouseName ?? undefined,
    isPalletTracked: row.isPalletTracked ?? false,
    palletLocationId: row.palletLocationId ?? undefined,
    palletCode: row.palletCode ?? undefined,
    palletLabel: row.palletLabel ?? undefined,
    palletZone: row.palletZone ?? undefined,
    quantityOnHand: row.quantityOnHand,
    quantityReserved: row.quantityReserved,
    available: row.quantityOnHand - row.quantityReserved,
    updatedAt: row.updatedAt,
  };
}

function toPalletStockResponse(row: InventoryBalanceRow) {
  return {
    id: row.id,
    skuId: row.skuId,
    skuCode: row.skuCode ?? "",
    productName: row.productName ?? "",
    category: row.category ?? "",
    unit: row.unit ?? "",
    quantityOnHand: row.quantityOnHand,
    quantityReserved: row.quantityReserved,
    available: row.quantityOnHand - row.quantityReserved,
    updatedAt: row.updatedAt,
  };
}

async function ensureInventoryInfrastructure() {
  if (!infraReadyPromise) {
    infraReadyPromise = (async () => {
      await db.query(`
        create table if not exists warehouses (
          "id" text primary key,
          "code" text not null unique,
          "name" text not null,
          "isPalletTracked" boolean not null default false,
          "isActive" boolean not null default true,
          "createdAt" timestamp(3) not null default current_timestamp,
          "updatedAt" timestamp(3) not null default current_timestamp
        )
      `);

      await db.query(`
        create table if not exists pallet_locations (
          "id" text primary key,
          "warehouseId" text not null references warehouses("id"),
          "code" text not null,
          "label" text not null,
          "zone" text,
          "isActive" boolean not null default true,
          "notes" text,
          "createdAt" timestamp(3) not null default current_timestamp,
          "updatedAt" timestamp(3) not null default current_timestamp,
          unique ("warehouseId", "code")
        )
      `);

      await db.query(`
        create table if not exists inventory_balances (
          "id" text primary key,
          "skuId" text not null references skus("id"),
          "warehouseId" text not null references warehouses("id"),
          "palletLocationId" text references pallet_locations("id"),
          "quantityOnHand" integer not null default 0,
          "quantityReserved" integer not null default 0,
          "updatedAt" timestamp(3) not null default current_timestamp
        )
      `);

      await db.query(`create index if not exists "inventory_balances_skuId_idx" on inventory_balances("skuId")`);
      await db.query(`create index if not exists "inventory_balances_warehouseId_idx" on inventory_balances("warehouseId")`);
      await db.query(`create index if not exists "inventory_balances_palletLocationId_idx" on inventory_balances("palletLocationId")`);

      await db.query(`alter table inventory_movements add column if not exists "warehouseId" text references warehouses("id")`);
      await db.query(`alter table inventory_movements add column if not exists "fromWarehouseId" text references warehouses("id")`);
      await db.query(`alter table inventory_movements add column if not exists "toWarehouseId" text references warehouses("id")`);
      await db.query(`alter table inventory_movements add column if not exists "palletLocationId" text references pallet_locations("id")`);
      await db.query(`alter table inventory_movements add column if not exists "fromPalletLocationId" text references pallet_locations("id")`);
      await db.query(`alter table inventory_movements add column if not exists "toPalletLocationId" text references pallet_locations("id")`);

      const seededWarehouses = [
        { code: "LA_MIRADA", name: "La Mirada CA", isPalletTracked: true },
        { code: "DALLAS", name: "Dallas TX", isPalletTracked: false },
      ];

      for (const warehouse of seededWarehouses) {
        await db.query(
          `
            insert into warehouses ("id", "code", "name", "isPalletTracked", "isActive", "updatedAt")
            values ($1, $2, $3, $4, true, now())
            on conflict ("code")
            do update set "name" = excluded."name", "isPalletTracked" = excluded."isPalletTracked", "updatedAt" = now()
          `,
          [randomUUID(), warehouse.code, warehouse.name, warehouse.isPalletTracked],
        );
      }

      const laMiradaResult = await db.query(`select id from warehouses where code = 'LA_MIRADA' limit 1`);
      const laMiradaId = String(laMiradaResult.rows[0]?.id ?? "");

      if (laMiradaId) {
        const starterPallets = [
          { code: "A1", label: "A1", zone: "Zone A" },
          { code: "A2", label: "A2", zone: "Zone A" },
          { code: "B1", label: "B1", zone: "Zone B" },
          { code: "B2", label: "B2", zone: "Zone B" },
        ];

        for (const pallet of starterPallets) {
          await db.query(
            `
              insert into pallet_locations ("id", "warehouseId", "code", "label", "zone", "isActive", "updatedAt")
              values ($1, $2, $3, $4, $5, true, now())
              on conflict ("warehouseId", "code")
              do update set "label" = excluded."label", "zone" = excluded."zone", "updatedAt" = now()
            `,
            [randomUUID(), laMiradaId, pallet.code, pallet.label, pallet.zone],
          );
        }
      }

      const warehousesResult = await db.query(`select id, code from warehouses`);
      const warehouseByCode = new Map<string, string>(
        warehousesResult.rows.map((row) => [String(row.code), String(row.id)]),
      );
      const laId = warehouseByCode.get("LA_MIRADA");
      const dallasId = warehouseByCode.get("DALLAS");

      const skuResult = await db.query(`
        select s.id, s."quantityOnHand", s."warehouseLocation"
        from skus s
        where not exists (
          select 1
          from inventory_balances b
          where b."skuId" = s.id
        )
      `);

      for (const row of skuResult.rows as Array<{ id: string; quantityOnHand: number; warehouseLocation: string | null }>) {
        const warehouseId =
          row.warehouseLocation?.toLowerCase().includes("dallas") && dallasId ? dallasId : laId ?? dallasId;

        if (!warehouseId) {
          continue;
        }

        await db.query(
          `
            insert into inventory_balances (
              "id", "skuId", "warehouseId", "palletLocationId", "quantityOnHand", "quantityReserved", "updatedAt"
            )
            values ($1, $2, $3, null, $4, 0, now())
          `,
          [randomUUID(), row.id, warehouseId, row.quantityOnHand],
        );
      }
    })().catch((error) => {
      infraReadyPromise = null;
      throw error;
    });
  }

  return infraReadyPromise;
}

async function getBalanceForUpdate(
  client: Pick<PoolClient, "query">,
  skuId: string,
  warehouseId: string,
  palletLocationId?: string,
) {
  const result = await client.query(
    `
      select *
      from inventory_balances
      where "skuId" = $1
        and "warehouseId" = $2
        and "palletLocationId" is not distinct from $3
      limit 1
      for update
    `,
    [skuId, warehouseId, palletLocationId ?? null],
  );

  return result.rows[0] as InventoryBalanceRow | undefined;
}

async function upsertBalanceQuantity(
  client: Pick<PoolClient, "query">,
  input: {
    skuId: string;
    warehouseId: string;
    palletLocationId?: string;
    deltaQoh: number;
  },
) {
  const existing = await getBalanceForUpdate(client, input.skuId, input.warehouseId, input.palletLocationId);

  if (!existing) {
    if (input.deltaQoh < 0) {
      throw new AppError("Source balance not found for the selected warehouse or pallet location", 400);
    }

    await client.query(
      `
        insert into inventory_balances (
          "id", "skuId", "warehouseId", "palletLocationId", "quantityOnHand", "quantityReserved", "updatedAt"
        )
        values ($1, $2, $3, $4, $5, 0, now())
      `,
      [randomUUID(), input.skuId, input.warehouseId, input.palletLocationId ?? null, input.deltaQoh],
    );
    return;
  }

  const nextQoh = existing.quantityOnHand + input.deltaQoh;

  if (nextQoh < 0) {
    throw new AppError("Movement would make pallet or warehouse stock negative", 400);
  }

  await client.query(
    `
      update inventory_balances
      set "quantityOnHand" = $2, "updatedAt" = now()
      where id = $1
    `,
    [existing.id, nextQoh],
  );
}

async function syncSkuQuantityOnHand(client: Pick<PoolClient, "query">, skuId: string) {
  const totalResult = await client.query(
    `
      select coalesce(sum("quantityOnHand"), 0)::int as "quantityOnHand"
      from inventory_balances
      where "skuId" = $1
    `,
    [skuId],
  );

  await client.query(`update skus set "quantityOnHand" = $2, "updatedAt" = now() where id = $1`, [
    skuId,
    totalResult.rows[0].quantityOnHand,
  ]);
}

async function getPalletUsageState(palletLocationId: string) {
  const [balanceResult, movementResult] = await Promise.all([
    db.query(
      `
        select
          coalesce(sum("quantityOnHand"), 0)::int as "quantityOnHand",
          coalesce(sum("quantityReserved"), 0)::int as "quantityReserved",
          count(*)::int as "balanceRows"
        from inventory_balances
        where "palletLocationId" = $1
      `,
      [palletLocationId],
    ),
    db.query(
      `
        select count(*)::int as total
        from inventory_movements
        where
          "palletLocationId" = $1
          or "fromPalletLocationId" = $1
          or "toPalletLocationId" = $1
      `,
      [palletLocationId],
    ),
  ]);

  return {
    quantityOnHand: balanceResult.rows[0].quantityOnHand,
    quantityReserved: balanceResult.rows[0].quantityReserved,
    balanceRows: balanceResult.rows[0].balanceRows,
    movementRows: movementResult.rows[0].total,
  };
}

function buildMovementWhere(input: {
  search?: string;
  skuId?: string;
  warehouseId?: string;
  palletLocationId?: string;
  user?: string;
  dateFrom?: string;
  dateTo?: string;
  movementType?: "INBOUND" | "OUTBOUND" | "ADJUSTMENT" | "TRANSFER";
  referenceType?: "SALES_ORDER" | "PHYSICAL_COUNT" | "OTHER" | "TRANSFER_WH_LOCATION";
}) {
  const params: Array<string | number> = [];
  const conditions: string[] = [];

  if (input.skuId) {
    params.push(input.skuId);
    conditions.push(`m."skuId" = $${params.length}`);
  }

  if (input.movementType) {
    params.push(input.movementType);
    conditions.push(`m."movementType" = $${params.length}`);
  }

  if (input.warehouseId) {
    params.push(input.warehouseId);
    conditions.push(
      `(m."warehouseId" = $${params.length} or m."fromWarehouseId" = $${params.length} or m."toWarehouseId" = $${params.length})`,
    );
  }

  if (input.palletLocationId) {
    params.push(input.palletLocationId);
    conditions.push(
      `(m."palletLocationId" = $${params.length} or m."fromPalletLocationId" = $${params.length} or m."toPalletLocationId" = $${params.length})`,
    );
  }

  if (input.user) {
    params.push(`%${input.user}%`);
    conditions.push(`(u."name" ilike $${params.length} or u.email ilike $${params.length})`);
  }

  if (input.dateFrom) {
    params.push(`${input.dateFrom}T00:00:00.000Z`);
    conditions.push(`m."createdAt" >= $${params.length}`);
  }

  if (input.dateTo) {
    params.push(`${input.dateTo}T23:59:59.999Z`);
    conditions.push(`m."createdAt" <= $${params.length}`);
  }

  if (input.referenceType) {
    params.push(input.referenceType);
    conditions.push(`m."referenceType" = $${params.length}`);
  }

  if (input.search) {
    params.push(`%${input.search}%`);
    conditions.push(
      `(s."skuCode" ilike $${params.length} or s."productName" ilike $${params.length} or coalesce(so."soNumber",'') ilike $${params.length})`,
    );
  }

  return {
    params,
    whereClause: conditions.length ? `where ${conditions.join(" and ")}` : "",
  };
}

async function insertAuditLog(
  client: Pick<PoolClient, "query">,
  input: {
    userId: string;
    action: string;
    tableName: string;
    recordId: string;
    changes?: Record<string, unknown>;
    soId?: string;
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

export const inventoryService = {
  async listWarehouses() {
    await ensureInventoryInfrastructure();
    const result = await db.query(`select * from warehouses where "isActive" = true order by name asc`);
    return {
      items: result.rows.map((row) => toWarehouseResponse(row as WarehouseRow)),
    };
  },

  async listPalletLocations(warehouseId?: string) {
    await ensureInventoryInfrastructure();
    const params: Array<string> = [];
    const whereClause = warehouseId
      ? (params.push(warehouseId), `where p."warehouseId" = $1 and p."isActive" = true`)
      : `where p."isActive" = true`;
    const result = await db.query(
      `
        select
          p.*,
          w.code as "warehouseCode",
          w.name as "warehouseName"
        from pallet_locations p
        join warehouses w on w.id = p."warehouseId"
        ${whereClause}
        order by w.name asc, p.code asc
      `,
      params,
    );

    return {
      items: result.rows.map((row) => toPalletLocationResponse(row as PalletLocationRow)),
    };
  },

  async palletStock(palletLocationId: string) {
    await ensureInventoryInfrastructure();
    const palletResult = await db.query(
      `
        select
          p.*,
          w.code as "warehouseCode",
          w.name as "warehouseName"
        from pallet_locations p
        join warehouses w on w.id = p."warehouseId"
        where p.id = $1
        limit 1
      `,
      [palletLocationId],
    );
    const pallet = palletResult.rows[0] as PalletLocationRow | undefined;

    if (!pallet) {
      throw new AppError("Pallet location not found", 404);
    }

    const stockResult = await db.query(
      `
        select
          b.*,
          s."skuCode" as "skuCode",
          s."productName" as "productName",
          s."category" as "category",
          s."unit" as "unit"
        from inventory_balances b
        join skus s on s.id = b."skuId"
        where b."palletLocationId" = $1 and b."quantityOnHand" > 0
        order by s."skuCode" asc
      `,
      [palletLocationId],
    );

    return {
      palletLocation: toPalletLocationResponse(pallet),
      items: stockResult.rows.map((row) => toPalletStockResponse(row as InventoryBalanceRow)),
    };
  },

  async createPalletLocation(
    input: {
      warehouseId: string;
      code: string;
      label: string;
      zone?: string;
      notes?: string;
      isActive: boolean;
    },
    userId: string,
  ) {
    await ensureInventoryInfrastructure();
    const warehouseResult = await db.query(`select * from warehouses where id = $1 limit 1`, [input.warehouseId]);
    const warehouse = warehouseResult.rows[0] as WarehouseRow | undefined;

    if (!warehouse) {
      throw new AppError("Warehouse not found", 404);
    }

    if (!warehouse.isPalletTracked) {
      throw new AppError("Pallet locations can only be created for pallet-tracked warehouses", 400);
    }

    const duplicateResult = await db.query(
      `select id from pallet_locations where "warehouseId" = $1 and upper("code") = upper($2) limit 1`,
      [input.warehouseId, input.code.trim()],
    );

    if (duplicateResult.rowCount) {
      throw new AppError("Pallet code already exists for this warehouse", 409);
    }

    const palletId = randomUUID();
    const result = await db.query(
      `
        insert into pallet_locations (
          "id", "warehouseId", "code", "label", "zone", "isActive", "notes", "updatedAt"
        )
        values ($1, $2, $3, $4, $5, $6, $7, now())
        returning *
      `,
      [
        palletId,
        input.warehouseId,
        input.code.trim().toUpperCase(),
        input.label.trim(),
        input.zone?.trim() || null,
        input.isActive,
        input.notes?.trim() || null,
      ],
    );

    await insertAuditLog(db as unknown as PoolClient, {
      userId,
      action: "CREATE_PALLET_LOCATION",
      tableName: "pallet_locations",
      recordId: palletId,
      changes: {
        warehouseId: input.warehouseId,
        code: input.code.trim().toUpperCase(),
        label: input.label.trim(),
        zone: input.zone?.trim() || null,
      },
    });

    return toPalletLocationResponse(result.rows[0] as PalletLocationRow);
  },

  async updatePalletLocation(
    id: string,
    input: Partial<{
      warehouseId: string;
      code: string;
      label: string;
      zone?: string;
      notes?: string;
      isActive: boolean;
    }>,
    userId: string,
  ) {
    await ensureInventoryInfrastructure();
    const existingResult = await db.query(`select * from pallet_locations where id = $1 limit 1`, [id]);
    const existing = existingResult.rows[0] as PalletLocationRow | undefined;

    if (!existing) {
      throw new AppError("Pallet location not found", 404);
    }

    const nextWarehouseId = input.warehouseId ?? existing.warehouseId;
    const nextCode = (input.code ?? existing.code).trim().toUpperCase();
    const nextLabel = (input.label ?? existing.label).trim();
    const nextZone = input.zone !== undefined ? input.zone.trim() || null : existing.zone;
    const nextNotes = input.notes !== undefined ? input.notes.trim() || null : existing.notes;
    const nextActive = input.isActive ?? existing.isActive;

    const warehouseResult = await db.query(`select * from warehouses where id = $1 limit 1`, [nextWarehouseId]);
    const warehouse = warehouseResult.rows[0] as WarehouseRow | undefined;

    if (!warehouse) {
      throw new AppError("Warehouse not found", 404);
    }

    if (!warehouse.isPalletTracked) {
      throw new AppError("Pallet locations can only be assigned to pallet-tracked warehouses", 400);
    }

    if ((input.isActive === false || (input.warehouseId && input.warehouseId !== existing.warehouseId)) && existing.isActive) {
      const usage = await getPalletUsageState(id);

      if (usage.quantityOnHand > 0 || usage.quantityReserved > 0) {
        throw new AppError(
          "Pallet location cannot be deactivated or moved while stock or reserved quantity is still assigned to it",
          400,
        );
      }
    }

    const duplicateResult = await db.query(
      `
        select id
        from pallet_locations
        where "warehouseId" = $1 and upper("code") = upper($2) and id <> $3
        limit 1
      `,
      [nextWarehouseId, nextCode, id],
    );

    if (duplicateResult.rowCount) {
      throw new AppError("Pallet code already exists for this warehouse", 409);
    }

    const result = await db.query(
      `
        update pallet_locations
        set
          "warehouseId" = $2,
          "code" = $3,
          "label" = $4,
          "zone" = $5,
          "notes" = $6,
          "isActive" = $7,
          "updatedAt" = now()
        where id = $1
        returning *
      `,
      [id, nextWarehouseId, nextCode, nextLabel, nextZone, nextNotes, nextActive],
    );

    await insertAuditLog(db as unknown as PoolClient, {
      userId,
      action: "UPDATE_PALLET_LOCATION",
      tableName: "pallet_locations",
      recordId: id,
      changes: {
        warehouseId: nextWarehouseId,
        code: nextCode,
        label: nextLabel,
        zone: nextZone,
        isActive: nextActive,
      },
    });

    return toPalletLocationResponse(result.rows[0] as PalletLocationRow);
  },

  async deletePalletLocation(id: string, userId: string) {
    await ensureInventoryInfrastructure();
    const existingResult = await db.query(`select * from pallet_locations where id = $1 limit 1`, [id]);
    const existing = existingResult.rows[0] as PalletLocationRow | undefined;

    if (!existing) {
      throw new AppError("Pallet location not found", 404);
    }

    const usage = await getPalletUsageState(id);

    if (
      usage.quantityOnHand > 0 ||
      usage.quantityReserved > 0 ||
      usage.balanceRows > 0 ||
      usage.movementRows > 0
    ) {
      throw new AppError(
        "Pallet location cannot be deleted because it is already in use by stock balances or movement history",
        400,
      );
    }

    await db.query(`delete from pallet_locations where id = $1`, [id]);

    await insertAuditLog(db as unknown as PoolClient, {
      userId,
      action: "DELETE_PALLET_LOCATION",
      tableName: "pallet_locations",
      recordId: id,
      changes: {
        code: existing.code,
        warehouseId: existing.warehouseId,
      },
    });
  },

  async skuLocationBalances(skuId: string) {
    await ensureInventoryInfrastructure();
    const skuResult = await db.query(`select id from skus where id = $1 limit 1`, [skuId]);

    if (!skuResult.rowCount) {
      throw new AppError("SKU not found", 404);
    }

    const result = await db.query(
      `
        select
          b.*,
          w.code as "warehouseCode",
          w.name as "warehouseName",
          w."isPalletTracked" as "isPalletTracked",
          p.code as "palletCode",
          p.label as "palletLabel",
          p.zone as "palletZone"
        from inventory_balances b
        join warehouses w on w.id = b."warehouseId"
        left join pallet_locations p on p.id = b."palletLocationId"
        where b."skuId" = $1
        order by w.name asc, coalesce(p.code, 'zzzz') asc
      `,
      [skuId],
    );

    return {
      items: result.rows.map((row) => toLocationBalanceResponse(row as InventoryBalanceRow)),
    };
  },

  async listSkus(input: {
    page: number;
    pageSize: number;
    search?: string;
    status?: "ACTIVE" | "INACTIVE" | "DISCONTINUED";
    category?: string;
    sortBy: SkuSortBy;
    sortDirection: SortDirection;
  }) {
    await ensureInventoryInfrastructure();
    const params: Array<string | number> = [];
    const conditions: string[] = [];
    const orderByMap: Record<SkuSortBy, string> = {
      updatedAt: `"updatedAt"`,
      createdAt: `"createdAt"`,
      skuCode: `"skuCode"`,
      productName: `"productName"`,
      quantityOnHand: `"quantityOnHand"`,
      available: `("quantityOnHand" - "quantityReserved")`,
      reorderLevel: `"reorderLevel"`,
    };

    if (input.status) {
      params.push(input.status);
      conditions.push(`"status" = $${params.length}`);
    }

    if (input.search) {
      params.push(`%${input.search}%`);
      conditions.push(`("skuCode" ilike $${params.length} or "productName" ilike $${params.length})`);
    }

    if (input.category) {
      params.push(input.category);
      conditions.push(`"category" = $${params.length}`);
    }

    const whereClause = conditions.length ? `where ${conditions.join(" and ")}` : "";
    const orderByClause = `${orderByMap[input.sortBy]} ${input.sortDirection}, "createdAt" desc`;
    const offset = (input.page - 1) * input.pageSize;
    const listParams = [...params, input.pageSize, offset];

    const [itemsResult, totalResult] = await Promise.all([
      db.query(
        `
          select *
          from skus
          ${whereClause}
          order by ${orderByClause}
          limit $${listParams.length - 1}
          offset $${listParams.length}
        `,
        listParams,
      ),
      db.query(`select count(*)::int as total from skus ${whereClause}`, params),
    ]);

    return {
      items: itemsResult.rows.map((row) => toSkuResponse(row as SkuRow)),
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        total: totalResult.rows[0].total,
      },
    };
  },

  async getSku(id: string) {
    await ensureInventoryInfrastructure();
    const result = await db.query(`select * from skus where id = $1 limit 1`, [id]);
    const sku = result.rows[0] as SkuRow | undefined;

    if (!sku) {
      throw new AppError("SKU not found", 404);
    }

    return toSkuResponse(sku);
  },

  async createSku(input: {
    skuCode: string;
    productName: string;
    description?: string;
    category: string;
    unit: string;
    unitCost: number;
    sellingPrice: number;
    reorderLevel: number;
    reorderQuantity: number;
    warehouseLocation?: string;
    status: "ACTIVE" | "INACTIVE" | "DISCONTINUED";
  }, userId: string) {
    await ensureInventoryInfrastructure();
    const existing = await db.query(`select id from skus where "skuCode" = $1 limit 1`, [input.skuCode]);

    if (existing.rowCount) {
      throw new AppError("SKU code already exists", 409);
    }

    const skuId = randomUUID();
    const result = await db.query(
      `
        insert into skus (
          "id", "skuCode", "productName", "description", "category", "unit",
          "unitCost", "sellingPrice", "reorderLevel", "reorderQuantity",
          "warehouseLocation", "status", "updatedAt"
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())
        returning *
      `,
      [
        skuId,
        input.skuCode,
        input.productName,
        input.description ?? null,
        input.category,
        input.unit,
        input.unitCost,
        input.sellingPrice,
        input.reorderLevel,
        input.reorderQuantity,
        input.warehouseLocation ?? null,
        input.status,
      ],
    );

    const created = result.rows[0] as SkuRow;

    await insertAuditLog(db as unknown as PoolClient, {
      userId,
      action: "CREATE_SKU",
      tableName: "skus",
      recordId: skuId,
      changes: {
        skuCode: created.skuCode,
        productName: created.productName,
        status: created.status,
      },
    });

    return toSkuResponse(created);
  },

  async updateSku(
    id: string,
    input: Partial<{
      skuCode: string;
      productName: string;
      description?: string;
      category: string;
      unit: string;
      unitCost: number;
      sellingPrice: number;
      reorderLevel: number;
      reorderQuantity: number;
      warehouseLocation?: string;
      status: "ACTIVE" | "INACTIVE" | "DISCONTINUED";
    }>,
    userId: string,
  ) {
    await ensureInventoryInfrastructure();
    const existingResult = await db.query(`select * from skus where id = $1 limit 1`, [id]);
    const existing = existingResult.rows[0] as SkuRow | undefined;

    if (!existing) {
      throw new AppError("SKU not found", 404);
    }

    if (input.skuCode && input.skuCode !== existing.skuCode) {
      const duplicate = await db.query(
        `select id from skus where "skuCode" = $1 and id <> $2 limit 1`,
        [input.skuCode, id],
      );

      if (duplicate.rowCount) {
        throw new AppError("SKU code already exists", 409);
      }
    }

    const merged = {
      skuCode: input.skuCode ?? existing.skuCode,
      productName: input.productName ?? existing.productName,
      description: input.description ?? existing.description,
      category: input.category ?? existing.category,
      unit: input.unit ?? existing.unit,
      unitCost: input.unitCost ?? existing.unitCost,
      sellingPrice: input.sellingPrice ?? existing.sellingPrice,
      reorderLevel: input.reorderLevel ?? existing.reorderLevel,
      reorderQuantity: input.reorderQuantity ?? existing.reorderQuantity,
      warehouseLocation: input.warehouseLocation ?? existing.warehouseLocation,
      status: input.status ?? existing.status,
    };

    const result = await db.query(
      `
        update skus
        set
          "skuCode" = $2,
          "productName" = $3,
          "description" = $4,
          "category" = $5,
          "unit" = $6,
          "unitCost" = $7,
          "sellingPrice" = $8,
          "reorderLevel" = $9,
          "reorderQuantity" = $10,
          "warehouseLocation" = $11,
          "status" = $12,
          "updatedAt" = now()
        where id = $1
        returning *
      `,
      [
        id,
        merged.skuCode,
        merged.productName,
        merged.description,
        merged.category,
        merged.unit,
        merged.unitCost,
        merged.sellingPrice,
        merged.reorderLevel,
        merged.reorderQuantity,
        merged.warehouseLocation,
        merged.status,
      ],
    );

    const updated = result.rows[0] as SkuRow;

    await insertAuditLog(db as unknown as PoolClient, {
      userId,
      action: "UPDATE_SKU",
      tableName: "skus",
      recordId: id,
      changes: {
        skuCode: updated.skuCode,
        productName: updated.productName,
        status: updated.status,
      },
    });

    return toSkuResponse(updated);
  },

  async softDeleteSku(id: string, userId: string) {
    await ensureInventoryInfrastructure();
    const existing = await db.query(`select id from skus where id = $1 limit 1`, [id]);

    if (!existing.rowCount) {
      throw new AppError("SKU not found", 404);
    }

    await db.query(`update skus set "status" = 'INACTIVE', "updatedAt" = now() where id = $1`, [id]);
    await insertAuditLog(db as unknown as PoolClient, {
      userId,
      action: "DEACTIVATE_SKU",
      tableName: "skus",
      recordId: id,
      changes: {
        status: "INACTIVE",
      },
    });
  },

  async createMovement(
    input: {
      skuId: string;
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
      fromWarehouseLocation?: string;
      toWarehouseLocation?: string;
      fromPalletLocation?: string;
      toPalletLocation?: string;
    },
    userId: string,
  ) {
    await ensureInventoryInfrastructure();
    const client = await db.connect();

    try {
      await client.query("begin");

      const skuResult = await client.query(`select * from skus where id = $1 for update`, [input.skuId]);
      const sku = skuResult.rows[0] as SkuRow | undefined;

      if (!sku) {
        throw new AppError("SKU not found", 404);
      }

      if (sku.status !== "ACTIVE") {
        throw new AppError("Only active SKUs can receive inventory movements", 400);
      }

      let movementQuantity = input.quantity;
      let action = input.movementType;
      let linkedReservation: ReservationRow | undefined;
      let nextWarehouseLocation = sku.warehouseLocation;

      const requiredWarehouseIds = new Set<string>();
      if (input.warehouseId) {
        requiredWarehouseIds.add(input.warehouseId);
      }
      if (input.fromWarehouseId) {
        requiredWarehouseIds.add(input.fromWarehouseId);
      }
      if (input.toWarehouseId) {
        requiredWarehouseIds.add(input.toWarehouseId);
      }

      const warehouseRowsResult = requiredWarehouseIds.size
        ? await client.query(`select * from warehouses where id = any($1::text[])`, [[...requiredWarehouseIds]])
        : { rows: [] };
      const warehouseMap = new Map<string, WarehouseRow>(
        (warehouseRowsResult.rows as WarehouseRow[]).map((row) => [row.id, row]),
      );

      const requiredPalletIds = new Set<string>();
      if (input.palletLocationId) {
        requiredPalletIds.add(input.palletLocationId);
      }
      if (input.fromPalletLocationId) {
        requiredPalletIds.add(input.fromPalletLocationId);
      }
      if (input.toPalletLocationId) {
        requiredPalletIds.add(input.toPalletLocationId);
      }

      const palletRowsResult = requiredPalletIds.size
        ? await client.query(`select * from pallet_locations where id = any($1::text[])`, [[...requiredPalletIds]])
        : { rows: [] };
      const palletMap = new Map<string, PalletLocationRow>(
        (palletRowsResult.rows as PalletLocationRow[]).map((row) => [row.id, row]),
      );

      const primaryWarehouse =
        (input.warehouseId ? warehouseMap.get(input.warehouseId) : undefined) ??
        (input.fromWarehouseId ? warehouseMap.get(input.fromWarehouseId) : undefined);
      const fromWarehouse = input.fromWarehouseId ? warehouseMap.get(input.fromWarehouseId) : primaryWarehouse;
      const toWarehouse = input.toWarehouseId ? warehouseMap.get(input.toWarehouseId) : primaryWarehouse;

      if (input.movementType !== "TRANSFER") {
        if (!primaryWarehouse) {
          throw new AppError("Warehouse is required for this movement", 400);
        }

        if (primaryWarehouse.isPalletTracked && !input.palletLocationId) {
          throw new AppError("A pallet location is required for pallet-tracked warehouses", 400);
        }
      } else {
        if (!fromWarehouse || !toWarehouse) {
          throw new AppError("Transfer movements require both source and destination warehouses", 400);
        }

        if (fromWarehouse.isPalletTracked && !input.fromPalletLocationId) {
          throw new AppError("A source pallet location is required for La Mirada transfers", 400);
        }

        if (toWarehouse.isPalletTracked && !input.toPalletLocationId) {
          throw new AppError("A destination pallet location is required for La Mirada transfers", 400);
        }
      }

      if (input.palletLocationId) {
        const pallet = palletMap.get(input.palletLocationId);
        if (!pallet || pallet.warehouseId !== primaryWarehouse?.id) {
          throw new AppError("Selected pallet location does not belong to the chosen warehouse", 400);
        }
      }

      if (input.fromPalletLocationId) {
        const pallet = palletMap.get(input.fromPalletLocationId);
        if (!pallet || pallet.warehouseId !== fromWarehouse?.id) {
          throw new AppError("Source pallet location does not belong to the selected source warehouse", 400);
        }
      }

      if (input.toPalletLocationId) {
        const pallet = palletMap.get(input.toPalletLocationId);
        if (!pallet || pallet.warehouseId !== toWarehouse?.id) {
          throw new AppError("Destination pallet location does not belong to the selected destination warehouse", 400);
        }
      }

      const resolvedFromWarehouseName = fromWarehouse?.name ?? input.fromWarehouseLocation ?? undefined;
      const resolvedToWarehouseName = toWarehouse?.name ?? input.toWarehouseLocation ?? undefined;
      const resolvedWarehouseName = primaryWarehouse?.name ?? input.toWarehouseLocation ?? input.fromWarehouseLocation ?? undefined;
      const resolvedFromPalletLabel =
        (input.fromPalletLocationId ? palletMap.get(input.fromPalletLocationId)?.code : undefined) ??
        input.fromPalletLocation ??
        undefined;
      const resolvedToPalletLabel =
        (input.toPalletLocationId ? palletMap.get(input.toPalletLocationId)?.code : undefined) ??
        (input.palletLocationId ? palletMap.get(input.palletLocationId)?.code : undefined) ??
        input.toPalletLocation ??
        undefined;
      const resolvedPalletLabel =
        (input.palletLocationId ? palletMap.get(input.palletLocationId)?.code : undefined) ?? undefined;

      const locationNotes = [
        resolvedFromWarehouseName ? `From WH Location: ${resolvedFromWarehouseName}` : null,
        resolvedToWarehouseName
          ? `To WH Location: ${resolvedToWarehouseName}`
          : resolvedWarehouseName && input.movementType !== "TRANSFER"
            ? `WH Location: ${resolvedWarehouseName}`
            : null,
        resolvedFromPalletLabel ? `From Pallet Location: ${resolvedFromPalletLabel}` : null,
        resolvedToPalletLabel
          ? `To Pallet Location: ${resolvedToPalletLabel}`
          : resolvedPalletLabel && input.movementType !== "TRANSFER"
            ? `Pallet Location: ${resolvedPalletLabel}`
            : null,
      ]
        .filter(Boolean)
        .join("\n");
      const movementNotes = [input.notes ?? null, locationNotes || null].filter(Boolean).join("\n");

      if (input.movementType === "OUTBOUND") {
        movementQuantity = -input.quantity;

        if (input.referenceType === "SALES_ORDER" && input.referenceId) {
          const salesOrderResult = await client.query(
            `
              select id, "soNumber", "status"
              from sales_orders
              where id = $1
              limit 1
              for update
            `,
            [input.referenceId],
          );
          const salesOrder = salesOrderResult.rows[0] as SalesOrderLinkRow | undefined;

          if (!salesOrder) {
            throw new AppError("Sales order not found for linked outbound movement", 404);
          }

          if (salesOrder.status !== "CONFIRMED") {
            throw new AppError(
              `Linked outbound is only allowed for CONFIRMED sales orders. Current status: ${salesOrder.status}`,
              400,
            );
          }

          const reservationResult = await client.query(
            `
              select *
              from inventory_reservations
              where "soId" = $1 and "skuId" = $2 and "status" = 'ACTIVE'
              limit 1
              for update
            `,
            [input.referenceId, input.skuId],
          );

          linkedReservation = reservationResult.rows[0] as ReservationRow | undefined;

          if (!linkedReservation) {
            throw new AppError("No active reservation found for this sales order and SKU", 400);
          }

          if (input.quantity > linkedReservation.quantityReserved) {
            throw new AppError("Outbound quantity exceeds the reserved quantity for this sales order", 400);
          }
        } else {
          const available = sku.quantityOnHand - sku.quantityReserved;

          if (input.quantity > available) {
            throw new AppError(`Outbound quantity exceeds available stock (${available})`, 400);
          }
        }

        if (input.quantity > sku.quantityOnHand) {
          throw new AppError(`Outbound quantity exceeds quantity on hand (${sku.quantityOnHand})`, 400);
        }
      }

      if (input.movementType === "INBOUND") {
        await upsertBalanceQuantity(client, {
          skuId: input.skuId,
          warehouseId: primaryWarehouse!.id,
          palletLocationId: input.palletLocationId,
          deltaQoh: input.quantity,
        });
        nextWarehouseLocation = primaryWarehouse!.name;
      }

      if (input.movementType === "ADJUSTMENT") {
        await upsertBalanceQuantity(client, {
          skuId: input.skuId,
          warehouseId: primaryWarehouse!.id,
          palletLocationId: input.palletLocationId,
          deltaQoh: input.quantity,
        });
        nextWarehouseLocation = primaryWarehouse!.name;
      }

      if (input.movementType === "OUTBOUND") {
        await upsertBalanceQuantity(client, {
          skuId: input.skuId,
          warehouseId: primaryWarehouse!.id,
          palletLocationId: input.palletLocationId,
          deltaQoh: -input.quantity,
        });
        nextWarehouseLocation = primaryWarehouse!.name;
      }

      if (input.movementType === "TRANSFER") {
        action = "TRANSFER";
        await upsertBalanceQuantity(client, {
          skuId: input.skuId,
          warehouseId: fromWarehouse!.id,
          palletLocationId: input.fromPalletLocationId,
          deltaQoh: -input.quantity,
        });
        await upsertBalanceQuantity(client, {
          skuId: input.skuId,
          warehouseId: toWarehouse!.id,
          palletLocationId: input.toPalletLocationId,
          deltaQoh: input.quantity,
        });
        nextWarehouseLocation = toWarehouse!.name;
      }

      await syncSkuQuantityOnHand(client, input.skuId);
      const refreshedSkuForReservedResult = await client.query(`select * from skus where id = $1 limit 1`, [input.skuId]);
      const refreshedSkuForReserved = refreshedSkuForReservedResult.rows[0] as SkuRow;
      let nextReserved = refreshedSkuForReserved.quantityReserved;
      const nextQoh = refreshedSkuForReserved.quantityOnHand;

      if (input.movementType === "ADJUSTMENT" && nextQoh < refreshedSkuForReserved.quantityReserved) {
        throw new AppError("Adjustment would make quantity on hand lower than reserved stock", 400);
      }

      if (input.movementType === "OUTBOUND" && linkedReservation) {
        nextReserved = Math.max(0, refreshedSkuForReserved.quantityReserved - input.quantity);
      }

      const movementId = randomUUID();
      const movementResult = await client.query(
        `
          insert into inventory_movements (
            "id", "skuId", "movementType", "quantity", "warehouseId", "fromWarehouseId", "toWarehouseId",
            "palletLocationId", "fromPalletLocationId", "toPalletLocationId", "referenceType",
            "referenceId", "reason", "notes", "createdBy"
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
          returning *
        `,
        [
          movementId,
          input.skuId,
          input.movementType,
          movementQuantity,
          input.movementType === "TRANSFER" ? null : primaryWarehouse?.id ?? null,
          fromWarehouse?.id ?? null,
          toWarehouse?.id ?? null,
          input.movementType === "TRANSFER" ? null : input.palletLocationId ?? null,
          input.fromPalletLocationId ?? null,
          input.toPalletLocationId ?? null,
          input.movementType === "TRANSFER" ? "TRANSFER_WH_LOCATION" : input.referenceType ?? null,
          input.referenceId ?? null,
          input.reason ?? null,
          movementNotes || null,
          userId,
        ],
      );

      if (input.movementType === "OUTBOUND") {
        await client.query(
          `
            update skus
            set "quantityReserved" = $2, "updatedAt" = now()
            where id = $1
          `,
          [input.skuId, nextReserved],
        );

        if (linkedReservation) {
          const remainingReserved = linkedReservation.quantityReserved - input.quantity;
          await client.query(
            `
              update inventory_reservations
              set
                "quantityReserved" = $2,
                "status" = $3,
                "updatedAt" = now()
              where id = $1
            `,
            [linkedReservation.id, remainingReserved, remainingReserved === 0 ? "RELEASED" : "ACTIVE"],
          );

          const activeReservations = await client.query(
            `
              select count(*)::int as total
              from inventory_reservations
              where "soId" = $1 and "status" = 'ACTIVE' and "quantityReserved" > 0
            `,
            [linkedReservation.soId],
          );

          if (activeReservations.rows[0].total === 0) {
            await client.query(
              `update sales_orders set "status" = 'SHIPPED', "updatedAt" = now() where id = $1 and "status" = 'CONFIRMED'`,
              [linkedReservation.soId],
            );
          }
        }
      }

      if (input.movementType === "TRANSFER") {
        await client.query(`update skus set "warehouseLocation" = $2, "updatedAt" = now() where id = $1`, [
          input.skuId,
          nextWarehouseLocation,
        ]);
      } else if (primaryWarehouse) {
        await client.query(`update skus set "warehouseLocation" = $2, "updatedAt" = now() where id = $1`, [
          input.skuId,
          primaryWarehouse.name,
        ]);
      }

      await insertAuditLog(client, {
        userId,
        action,
        tableName: "inventory_movements",
        recordId: movementId,
        soId: linkedReservation?.soId,
        changes: {
          skuId: input.skuId,
          movementType: input.movementType,
          quantity: movementQuantity,
          warehouseId: input.warehouseId,
          fromWarehouseId: input.fromWarehouseId,
          toWarehouseId: input.toWarehouseId,
          palletLocationId: input.palletLocationId,
          fromPalletLocationId: input.fromPalletLocationId,
          toPalletLocationId: input.toPalletLocationId,
          referenceType: input.movementType === "TRANSFER" ? "TRANSFER_WH_LOCATION" : input.referenceType,
          referenceId: input.referenceId,
          nextQoh,
          nextReserved,
          fromWarehouseLocation: resolvedFromWarehouseName,
          toWarehouseLocation: resolvedToWarehouseName ?? resolvedWarehouseName,
          fromPalletLocation: resolvedFromPalletLabel,
          toPalletLocation: resolvedToPalletLabel ?? resolvedPalletLabel,
          nextWarehouseLocation,
        },
      });

      await client.query("commit");

      const movement = movementResult.rows[0] as MovementRow;
      const refreshedSkuResult = await db.query(`select * from skus where id = $1 limit 1`, [input.skuId]);

      return {
        movement: toMovementResponse(movement),
        sku: toSkuResponse(refreshedSkuResult.rows[0] as SkuRow),
      };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  },

  async listMovements(input: {
    page: number;
    pageSize: number;
    search?: string;
    skuId?: string;
    warehouseId?: string;
    palletLocationId?: string;
    user?: string;
    dateFrom?: string;
    dateTo?: string;
    movementType?: "INBOUND" | "OUTBOUND" | "ADJUSTMENT" | "TRANSFER";
    referenceType?: "SALES_ORDER" | "PHYSICAL_COUNT" | "OTHER" | "TRANSFER_WH_LOCATION";
    sortBy: MovementSortBy;
    sortDirection: SortDirection;
  }) {
    await ensureInventoryInfrastructure();
    const { params, whereClause } = buildMovementWhere(input);
    const orderByMap: Record<MovementSortBy, string> = {
      createdAt: `m."createdAt"`,
      quantity: `abs(m."quantity")`,
      movementType: `m."movementType"`,
    };
    const orderByClause = `${orderByMap[input.sortBy]} ${input.sortDirection}, m."createdAt" desc`;
    const offset = (input.page - 1) * input.pageSize;
    const listParams = [...params, input.pageSize, offset];

    const [itemsResult, totalResult] = await Promise.all([
      db.query(
        `
          select
            m.*,
            s."skuCode" as "skuCode",
            s."productName" as "productName",
            u."name" as "createdByName"
          from inventory_movements m
          join skus s on s.id = m."skuId"
          join users u on u.id = m."createdBy"
          left join sales_orders so on so.id = m."referenceId" and m."referenceType" = 'SALES_ORDER'
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
          from inventory_movements m
          join skus s on s.id = m."skuId"
          join users u on u.id = m."createdBy"
          left join sales_orders so on so.id = m."referenceId" and m."referenceType" = 'SALES_ORDER'
          ${whereClause}
        `,
        params,
      ),
    ]);

    return {
      items: itemsResult.rows.map((row) => toMovementResponse(row as MovementRow)),
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        total: totalResult.rows[0].total,
      },
    };
  },

  async skuHistory(skuId: string, page: number, pageSize: number) {
    await ensureInventoryInfrastructure();
    const sku = await db.query(`select id from skus where id = $1 limit 1`, [skuId]);

    if (!sku.rowCount) {
      throw new AppError("SKU not found", 404);
    }

    return this.listMovements({ skuId, page, pageSize, sortBy: "createdAt", sortDirection: "desc" });
  },

  async skuActivity(skuId: string, page: number, pageSize: number) {
    await ensureInventoryInfrastructure();
    const sku = await db.query(`select id from skus where id = $1 limit 1`, [skuId]);

    if (!sku.rowCount) {
      throw new AppError("SKU not found", 404);
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
          where
            (a."tableName" = 'skus' and a."recordId" = $1)
            or (a."tableName" = 'inventory_movements' and a."changes"->>'skuId' = $1)
          order by a."createdAt" desc
          limit $2
          offset $3
        `,
        [skuId, pageSize, offset],
      ),
      db.query(
        `
          select count(*)::int as total
          from audit_logs a
          where
            (a."tableName" = 'skus' and a."recordId" = $1)
            or (a."tableName" = 'inventory_movements' and a."changes"->>'skuId' = $1)
        `,
        [skuId],
      ),
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

  async dashboard() {
    await ensureInventoryInfrastructure();
    const [summaryResult, todayMovementsResult, recentMovementsResult] = await Promise.all([
      db.query(
        `
          select
            count(*) filter (where "status" = 'ACTIVE')::int as "totalSkus",
            count(*) filter (where "status" = 'ACTIVE' and "quantityOnHand" < "reorderLevel")::int as "lowStockItems",
            coalesce(sum(("quantityOnHand") * ("unitCost")) filter (where "status" = 'ACTIVE'), 0)::numeric(12,2) as "totalInventoryValue"
          from skus
        `,
      ),
      db.query(
        `
          select count(*)::int as "todayMovementCount"
          from inventory_movements
          where "createdAt" >= current_date
        `,
      ),
      db.query(
        `
          select
            m.*,
            s."skuCode" as "skuCode",
            s."productName" as "productName",
            u."name" as "createdByName"
          from inventory_movements m
          join skus s on s.id = m."skuId"
          join users u on u.id = m."createdBy"
          order by m."createdAt" desc
          limit 10
        `,
      ),
    ]);

    return {
      metrics: {
        totalSkus: summaryResult.rows[0].totalSkus,
        lowStockItems: summaryResult.rows[0].lowStockItems,
        totalInventoryValue: String(summaryResult.rows[0].totalInventoryValue),
        todayMovementCount: todayMovementsResult.rows[0].todayMovementCount,
      },
      recentMovements: recentMovementsResult.rows.map((row) => toMovementResponse(row as MovementRow)),
    };
  },

  async lowStock() {
    await ensureInventoryInfrastructure();
    const result = await db.query(
      `
        select *
        from skus
        where "status" = 'ACTIVE' and "quantityOnHand" < "reorderLevel"
        order by ("reorderLevel" - "quantityOnHand") desc, "productName" asc
      `,
    );

    return {
      items: result.rows.map((row) => toSkuResponse(row as SkuRow)),
    };
  },
};
