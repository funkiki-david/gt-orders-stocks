import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { db } from "../config/db.js";
import type { PoolClient } from "pg";

const DEFAULT_SALES_SOURCE =
  "https://drive.google.com/file/d/1rB0b327-Qy6iZXb-ykj8RU5orMa5cNYG/view?usp=drivesdk";
const DEFAULT_STOCK_SOURCE =
  "https://drive.google.com/file/d/1gHFzHrYNvFdbD-twKzUNQQ2qTlUqtAfB/view?usp=drivesdk";

type ImportMode = "all" | "stock" | "sales";
type OrderStatus = "DRAFT" | "SHIPPED";
type UserRow = {
  id: string;
  email: string;
};
type CustomerRow = {
  id: string;
  companyName: string;
  notes: string | null;
};
type SkuRow = {
  id: string;
  skuCode: string;
  productName: string;
  category: string;
  unit: string;
  sellingPrice: string | number;
  unitCost: string | number;
  quantityOnHand: number;
  quantityReserved: number;
  warehouseLocation: string | null;
};
type ParsedStockRow = {
  skuCode: string;
  productName: string;
  category: string;
  quantityOnHand: number;
};
type ParsedSalesRow = {
  orderDate: string;
  shipDate?: string;
  invoiceNumber: string;
  customerName: string;
  poNumber?: string;
  productSku: string;
  description: string;
  widthInch?: string;
  lengthFeet?: string;
  category: string;
  quantitySold: number;
  unitPrice: number;
  total: number;
  paymentInfo?: string;
  shipMethod?: string;
  shipCost?: string;
  salesRep?: string;
  commissionPerRoll?: string;
  totalCommission?: string;
};
type ImportOptions = {
  mode: ImportMode;
  dryRun: boolean;
  salesSource: string;
  stockSource: string;
  userEmail: string;
  inventoryUnit: string;
  salesUnit: string;
  warehouseLocation: string;
  stockReason: string;
  stockNotes: string;
};
type Summary = {
  stock: {
    processed: number;
    created: number;
    updated: number;
    unchanged: number;
    movements: number;
    skipped: number;
  };
  sales: {
    processed: number;
    imported: number;
    customersCreated: number;
    customersUpdated: number;
    skusCreated: number;
    duplicatesSkipped: number;
    skipped: number;
  };
};

function parseArguments(argv: string[]): ImportOptions {
  const options: ImportOptions = {
    mode: "all",
    dryRun: argv.includes("--dry-run"),
    salesSource: DEFAULT_SALES_SOURCE,
    stockSource: DEFAULT_STOCK_SOURCE,
    userEmail: "admin@gt.local",
    inventoryUnit: "CTN",
    salesUnit: "ROLL",
    warehouseLocation: "La Mirada Warehouse",
    stockReason: "Historical stock count import",
    stockNotes: "Imported opening stock baseline from La Mirada warehouse count TSV.",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if (!current.startsWith("--")) {
      continue;
    }

    switch (current) {
      case "--mode":
        if (next === "all" || next === "stock" || next === "sales") {
          options.mode = next;
          index += 1;
        }
        break;
      case "--sales-source":
        if (next) {
          options.salesSource = next;
          index += 1;
        }
        break;
      case "--stock-source":
        if (next) {
          options.stockSource = next;
          index += 1;
        }
        break;
      case "--user-email":
        if (next) {
          options.userEmail = next;
          index += 1;
        }
        break;
      case "--inventory-unit":
        if (next) {
          options.inventoryUnit = next;
          index += 1;
        }
        break;
      case "--sales-unit":
        if (next) {
          options.salesUnit = next;
          index += 1;
        }
        break;
      case "--warehouse-location":
        if (next) {
          options.warehouseLocation = next;
          index += 1;
        }
        break;
      case "--stock-reason":
        if (next) {
          options.stockReason = next;
          index += 1;
        }
        break;
      case "--stock-notes":
        if (next) {
          options.stockNotes = next;
          index += 1;
        }
        break;
      default:
        break;
    }
  }

  return options;
}

function parseTsv(text: string) {
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  return lines
    .map((line) => line.split("\t").map((cell) => cell.trim()))
    .filter((row) => row.some((cell) => cell.length > 0));
}

function extractGoogleDriveFileId(source: string) {
  const idParamMatch = source.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idParamMatch) {
    return idParamMatch[1];
  }

  const pathMatch = source.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (pathMatch) {
    return pathMatch[1];
  }

  if (/^[a-zA-Z0-9_-]{20,}$/.test(source)) {
    return source;
  }

  return null;
}

function buildDownloadUrl(source: string) {
  const fileId = extractGoogleDriveFileId(source);
  if (fileId) {
    return `https://drive.google.com/uc?export=download&id=${fileId}`;
  }
  return source;
}

async function readSourceText(source: string) {
  if (/^https?:\/\//i.test(source) || extractGoogleDriveFileId(source)) {
    const response = await fetch(buildDownloadUrl(source));
    if (!response.ok) {
      throw new Error(`Could not download source: ${source} (${response.status})`);
    }
    return response.text();
  }

  return readFile(source, "utf8");
}

function parseDecimal(input: string) {
  const cleaned = input.replace(/[$,]/g, "").trim();
  if (!cleaned) {
    return 0;
  }
  const value = Number(cleaned);
  if (Number.isNaN(value)) {
    throw new Error(`Invalid numeric value: ${input}`);
  }
  return value;
}

function safeDateString(input?: string) {
  if (!input) {
    return undefined;
  }
  const trimmed = input.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed;
}

function toIsoDate(input: string) {
  return new Date(`${input}T12:00:00.000Z`).toISOString();
}

function parseStockRows(text: string) {
  const rows = parseTsv(text);
  if (!rows.length) {
    return [];
  }

  const header = rows[0].map((cell, index) => (cell || `column_${index}`).trim());
  const data = rows.slice(1);
  const mapped: ParsedStockRow[] = [];

  for (const row of data) {
    const record = Object.fromEntries(header.map((key, index) => [key, row[index] ?? ""]));
    const skuCode = record["SKU"]?.trim();
    if (!skuCode) {
      continue;
    }

    mapped.push({
      skuCode,
      productName: record["Product Description"]?.trim() ?? skuCode,
      category: record["Category"]?.trim() || "Uncategorized",
      quantityOnHand: Math.trunc(parseDecimal(record["Total Qty (CTN)"] ?? "0")),
    });
  }

  return mapped;
}

function parseSalesRows(text: string) {
  const rows = parseTsv(text);
  if (!rows.length) {
    return [];
  }

  const rawHeader = rows[0];
  const header = rawHeader.map((cell, index) => (cell || `column_${index}`).trim());
  const data = rows.slice(1);
  const mapped: ParsedSalesRow[] = [];

  for (const row of data) {
    const record = Object.fromEntries(header.map((key, index) => [key, row[index] ?? ""]));
    const invoiceNumber = record["Invoice #"]?.trim();
    const customerName = record["Customer"]?.trim();
    const productSku = record["Product SKU"]?.trim();

    if (!invoiceNumber || !customerName || !productSku) {
      continue;
    }

    mapped.push({
      orderDate: record["Order Date"].trim(),
      shipDate: safeDateString(record["Ship Date"]),
      invoiceNumber,
      customerName,
      poNumber: safeDateString(record["PO #"]),
      productSku,
      description: record["Description"]?.trim() || productSku,
      widthInch: safeDateString(record["Width (Inch)"]),
      lengthFeet: safeDateString(record["Length (Feet)"]),
      category: record["Category"]?.trim() || "Uncategorized",
      quantitySold: Math.trunc(parseDecimal(record["Qty Sold"] ?? "0")),
      unitPrice: parseDecimal(record["Unit Price"] ?? "0"),
      total: parseDecimal(record["Total"] ?? "0"),
      paymentInfo: safeDateString(record["Payment Info"]),
      shipMethod: safeDateString(record["Ship Method"]),
      shipCost: safeDateString(record["Ship Cost"]),
      salesRep: safeDateString(record["Sales Rep"]),
      commissionPerRoll: safeDateString(record["Commision Per Roll"]),
      totalCommission: safeDateString(record["Total Commission"]),
    });
  }

  return mapped;
}

function buildImportedOrderNotes(rows: ParsedSalesRow[], status: OrderStatus) {
  const first = rows[0];
  const noteLines = [
    `Imported from Sales Orders reference sheet.`,
    `Original Invoice #: ${first.invoiceNumber}`,
    `Imported Status: ${status}`,
    `Ship Date: ${first.shipDate ?? ""}`,
    `PO #: ${first.poNumber ?? ""}`,
    `Payment Info: ${first.paymentInfo ?? ""}`,
    `Ship Method: ${first.shipMethod ?? ""}`,
    `Ship Cost: ${first.shipCost ?? ""}`,
    `Sales Rep: ${first.salesRep ?? ""}`,
  ];

  if (rows.length === 1) {
    noteLines.push(`Width (Inch): ${first.widthInch ?? ""}`);
    noteLines.push(`Length (Feet): ${first.lengthFeet ?? ""}`);
  }

  const nonEmpty = noteLines.filter((line) => !line.endsWith(": "));
  return nonEmpty.join("\n");
}

async function getImportUser(email: string) {
  const result = await db.query<UserRow>(`select id, email from users where lower(email) = lower($1) limit 1`, [email]);
  if (!result.rowCount) {
    throw new Error(`Import user not found: ${email}`);
  }
  return result.rows[0];
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

async function ensureCustomer(
  client: PoolClient,
  companyName: string,
  userId: string,
  summary: Summary["sales"],
  dryRun: boolean,
) {
  const existingResult = await client.query<CustomerRow>(
    `select id, "companyName", notes from customers where lower("companyName") = lower($1) limit 1`,
    [companyName],
  );
  const existing = existingResult.rows[0];

  if (existing) {
    return existing;
  }

  const customer: CustomerRow = {
    id: randomUUID(),
    companyName,
    notes: "Imported from legacy sales order sheet.",
  };

  if (!dryRun) {
    await client.query(
      `
        insert into customers ("id", "companyName", notes, "paymentTerms", active, "updatedAt")
        values ($1, $2, $3, 'Net 30', true, now())
      `,
      [customer.id, customer.companyName, customer.notes],
    );

    await insertAuditLog(client, {
      userId,
      action: "IMPORT_CUSTOMER",
      tableName: "customers",
      recordId: customer.id,
      changes: {
        companyName,
      },
    });
  }

  summary.customersCreated += 1;
  return customer;
}

async function ensureSkuFromSalesRow(
  client: PoolClient,
  row: ParsedSalesRow,
  options: ImportOptions,
  userId: string,
  summary: Summary["sales"],
  dryRun: boolean,
) {
  const existingResult = await client.query<SkuRow>(
    `
      select
        id,
        "skuCode",
        "productName",
        category,
        unit,
        "sellingPrice",
        "unitCost",
        "quantityOnHand",
        "quantityReserved",
        "warehouseLocation"
      from skus
      where "skuCode" = $1
      limit 1
    `,
    [row.productSku],
  );
  const existing = existingResult.rows[0];

  if (existing) {
    return existing;
  }

  const sku: SkuRow = {
    id: randomUUID(),
    skuCode: row.productSku,
    productName: row.description,
    category: row.category,
    unit: options.salesUnit,
    sellingPrice: row.unitPrice,
    unitCost: 0,
    quantityOnHand: 0,
    quantityReserved: 0,
    warehouseLocation: options.warehouseLocation,
  };

  if (!dryRun) {
    await client.query(
      `
        insert into skus (
          "id", "skuCode", "productName", description, category, unit, "unitCost", "sellingPrice",
          "quantityOnHand", "quantityReserved", "reorderLevel", "reorderQuantity", "warehouseLocation", status, "updatedAt"
        )
        values ($1, $2, $3, $4, $5, $6, 0, $7, 0, 0, 0, 0, $8, 'ACTIVE', now())
      `,
      [sku.id, sku.skuCode, sku.productName, row.description, sku.category, sku.unit, sku.sellingPrice, sku.warehouseLocation],
    );

    await insertAuditLog(client, {
      userId,
      action: "IMPORT_SKU_FROM_SALES",
      tableName: "skus",
      recordId: sku.id,
      changes: {
        skuCode: sku.skuCode,
        unit: sku.unit,
      },
    });
  }

  summary.skusCreated += 1;
  return sku;
}

async function nextImportedSoNumber(client: PoolClient, year: number) {
  const prefix = `IMP-${year}-`;
  const result = await client.query<{ total: number }>(
    `
      select count(*)::int as total
      from sales_orders
      where "soNumber" like $1
    `,
    [`${prefix}%`],
  );
  const next = result.rows[0].total + 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
}

async function importStockRows(
  rows: ParsedStockRow[],
  importUser: UserRow,
  options: ImportOptions,
  summary: Summary["stock"],
) {
  for (const row of rows) {
    summary.processed += 1;
    const client = await db.connect();

    try {
      await client.query("begin");

      const existingResult = await client.query<SkuRow>(
        `
          select
            id,
            "skuCode",
            "productName",
            category,
            unit,
            "sellingPrice",
            "unitCost",
            "quantityOnHand",
            "quantityReserved",
            "warehouseLocation"
          from skus
          where "skuCode" = $1
          limit 1
          for update
        `,
        [row.skuCode],
      );
      const existing = existingResult.rows[0];
      const nextLocation = options.warehouseLocation;

      if (!existing) {
        if (!options.dryRun) {
          const skuId = randomUUID();

          await client.query(
            `
              insert into skus (
                "id", "skuCode", "productName", description, category, unit, "unitCost", "sellingPrice",
                "quantityOnHand", "quantityReserved", "reorderLevel", "reorderQuantity", "warehouseLocation", status, "updatedAt"
              )
              values ($1, $2, $3, $4, $5, $6, 0, 0, 0, 0, 0, 0, $7, 'ACTIVE', now())
            `,
            [skuId, row.skuCode, row.productName, row.productName, row.category, options.inventoryUnit, nextLocation],
          );

          if (row.quantityOnHand !== 0) {
            await client.query(
              `
                update skus
                set "quantityOnHand" = $2, "updatedAt" = now()
                where id = $1
              `,
              [skuId, row.quantityOnHand],
            );

            await client.query(
              `
                insert into inventory_movements (
                  "id", "skuId", "movementType", quantity, "referenceType", reason, notes, "createdBy"
                )
                values ($1, $2, 'ADJUSTMENT', $3, 'PHYSICAL_COUNT', $4, $5, $6)
              `,
              [randomUUID(), skuId, row.quantityOnHand, options.stockReason, options.stockNotes, importUser.id],
            );
            summary.movements += 1;
          }

          await insertAuditLog(client, {
            userId: importUser.id,
            action: "IMPORT_SKU",
            tableName: "skus",
            recordId: skuId,
            changes: {
              skuCode: row.skuCode,
              quantityOnHand: row.quantityOnHand,
              unit: options.inventoryUnit,
            },
          });
        }

        summary.created += 1;
        await client.query("commit");
        continue;
      }

      if (row.quantityOnHand < existing.quantityReserved) {
        summary.skipped += 1;
        await client.query("rollback");
        console.warn(
          `Skipped stock import for ${row.skuCode}: target quantity ${row.quantityOnHand} is below reserved ${existing.quantityReserved}.`,
        );
        continue;
      }

      const delta = row.quantityOnHand - existing.quantityOnHand;
      const changed =
        existing.productName !== row.productName ||
        existing.category !== row.category ||
        existing.unit !== options.inventoryUnit ||
        (existing.warehouseLocation ?? "") !== nextLocation ||
        delta !== 0;

      if (!changed) {
        summary.unchanged += 1;
        await client.query("rollback");
        continue;
      }

      if (!options.dryRun) {
        await client.query(
          `
            update skus
            set
              "productName" = $2,
              description = $3,
              category = $4,
              unit = $5,
              "warehouseLocation" = $6,
              "quantityOnHand" = $7,
              "updatedAt" = now()
            where id = $1
          `,
          [existing.id, row.productName, row.productName, row.category, options.inventoryUnit, nextLocation, row.quantityOnHand],
        );

        if (delta !== 0) {
          await client.query(
            `
              insert into inventory_movements (
                "id", "skuId", "movementType", quantity, "referenceType", reason, notes, "createdBy"
              )
              values ($1, $2, 'ADJUSTMENT', $3, 'PHYSICAL_COUNT', $4, $5, $6)
            `,
            [randomUUID(), existing.id, delta, options.stockReason, options.stockNotes, importUser.id],
          );
          summary.movements += 1;
        }

        await insertAuditLog(client, {
          userId: importUser.id,
          action: "IMPORT_STOCK_COUNT",
          tableName: "skus",
          recordId: existing.id,
          changes: {
            skuCode: row.skuCode,
            previousQuantityOnHand: existing.quantityOnHand,
            nextQuantityOnHand: row.quantityOnHand,
            delta,
          },
        });
      }

      summary.updated += 1;
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
}

async function importSalesOrders(
  rows: ParsedSalesRow[],
  importUser: UserRow,
  options: ImportOptions,
  summary: Summary["sales"],
) {
  const groups = new Map<string, ParsedSalesRow[]>();
  const customerCache = new Map<string, CustomerRow>();
  const salesSkuCache = new Map<string, SkuRow>();

  for (const row of rows) {
    const key = row.invoiceNumber;
    const current = groups.get(key) ?? [];
    current.push(row);
    groups.set(key, current);
  }

  for (const [invoiceNumber, lineRows] of groups) {
    summary.processed += 1;
    const client = await db.connect();

    try {
      await client.query("begin");

      const existingOrder = await client.query<{ id: string }>(
        `select id from sales_orders where notes ilike $1 limit 1 for update`,
        [`%Original Invoice #: ${invoiceNumber}%`],
      );

      if (existingOrder.rowCount) {
        summary.duplicatesSkipped += 1;
        await client.query("rollback");
        continue;
      }

      const first = lineRows[0];
      if (!first.orderDate || lineRows.some((row) => row.customerName !== first.customerName)) {
        summary.skipped += 1;
        await client.query("rollback");
        console.warn(`Skipped sales import for invoice ${invoiceNumber}: inconsistent customer or missing order date.`);
        continue;
      }

      let customer = customerCache.get(first.customerName.toLowerCase());
      if (!customer) {
        customer = await ensureCustomer(client, first.customerName, importUser.id, summary, options.dryRun);
        customerCache.set(first.customerName.toLowerCase(), customer);
      }
      const lines: Array<{ skuId: string; quantityOrdered: number; unitPrice: number; lineTotal: number }> = [];

      for (const row of lineRows) {
        const cacheKey = row.productSku.toUpperCase();
        let sku = salesSkuCache.get(cacheKey);
        if (!sku) {
          sku = await ensureSkuFromSalesRow(client, row, options, importUser.id, summary, options.dryRun);
          salesSkuCache.set(cacheKey, sku);
        }
        lines.push({
          skuId: sku.id,
          quantityOrdered: row.quantitySold,
          unitPrice: row.unitPrice,
          lineTotal: Number((row.quantitySold * row.unitPrice).toFixed(2)),
        });
      }

      const status: OrderStatus = first.shipDate ? "SHIPPED" : "DRAFT";
      const totalAmount = Number(lines.reduce((sum, line) => sum + line.lineTotal, 0).toFixed(2));
      const soId = randomUUID();
      const soNumber = await nextImportedSoNumber(client, new Date(first.orderDate).getUTCFullYear());
      const notes = buildImportedOrderNotes(lineRows, status);

      if (!options.dryRun) {
        await client.query(
          `
            insert into sales_orders (
              "id", "soNumber", "customerId", "orderDate", status, "totalAmount", notes, "createdBy", "createdAt", "updatedAt"
            )
            values ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())
          `,
          [soId, soNumber, customer.id, toIsoDate(first.orderDate), status, totalAmount, notes, importUser.id],
        );

        for (const line of lines) {
          await client.query(
            `
              insert into so_line_items (
                "id", "soId", "skuId", "quantityOrdered", "unitPrice", "lineTotal", "createdAt", "updatedAt"
              )
              values ($1, $2, $3, $4, $5, $6, now(), now())
            `,
            [randomUUID(), soId, line.skuId, line.quantityOrdered, line.unitPrice, line.lineTotal],
          );
        }

        await insertAuditLog(client, {
          userId: importUser.id,
          action: "IMPORT_SO",
          tableName: "sales_orders",
          recordId: soId,
          soId,
          changes: {
            soNumber,
            invoiceNumber,
            importedStatus: status,
            lines: lines.length,
            totalAmount,
          },
        });
      }

      summary.imported += 1;
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const summary: Summary = {
    stock: {
      processed: 0,
      created: 0,
      updated: 0,
      unchanged: 0,
      movements: 0,
      skipped: 0,
    },
    sales: {
      processed: 0,
      imported: 0,
      customersCreated: 0,
      customersUpdated: 0,
      skusCreated: 0,
      duplicatesSkipped: 0,
      skipped: 0,
    },
  };

  const importUser = await getImportUser(options.userEmail);

  if (options.mode === "all" || options.mode === "stock") {
    const stockRows = parseStockRows(await readSourceText(options.stockSource));
    await importStockRows(stockRows, importUser, options, summary.stock);
  }

  if (options.mode === "all" || options.mode === "sales") {
    const salesRows = parseSalesRows(await readSourceText(options.salesSource));
    await importSalesOrders(salesRows, importUser, options, summary.sales);
  }

  console.log(
    JSON.stringify(
      {
        dryRun: options.dryRun,
        mode: options.mode,
        inventoryUnit: options.inventoryUnit,
        salesUnit: options.salesUnit,
        caution:
          "Stock imports use the inventory unit, while sales imports preserve historical order lines without applying reservations or outbound inventory movements.",
        summary,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.end();
  });
