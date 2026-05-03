import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { db } from "../config/db.js";
import type { PoolClient } from "pg";

type ImportOptions = {
  source: string;
  dryRun: boolean;
  warehouseName: string;
  unknownPalletCode: string;
};

type ParsedRow = {
  warehouse: string;
  palletLocation: string;
  skuCode: string;
  count: number;
  productName: string;
  category: string;
};

type WarehouseRow = {
  id: string;
  code: string;
  name: string;
  isPalletTracked: boolean;
};

type PalletLocationRow = {
  id: string;
  warehouseId: string;
  code: string;
  label: string;
};

type SkuMatchRow = {
  id: string;
  skuCode: string;
};

function parseArguments(argv: string[]): ImportOptions {
  const options: ImportOptions = {
    source: "/Users/davidz/Documents/New project/docs/Sheet13-ready-to-import-pallet-reference.tsv",
    dryRun: argv.includes("--dry-run"),
    warehouseName: "La Mirada CA",
    unknownPalletCode: "Unknown Pallet Location",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if (!current.startsWith("--")) {
      continue;
    }

    switch (current) {
      case "--source":
        if (next) {
          options.source = next;
          index += 1;
        }
        break;
      case "--warehouse-name":
        if (next) {
          options.warehouseName = next;
          index += 1;
        }
        break;
      case "--unknown-pallet":
        if (next) {
          options.unknownPalletCode = next;
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
  return text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.split("\t").map((cell) => cell.trim()))
    .filter((row) => row.some((cell) => cell.length > 0));
}

function parseRows(text: string) {
  const rows = parseTsv(text);
  if (!rows.length) {
    return [] as ParsedRow[];
  }

  const header = rows[0];
  const data = rows.slice(1);

  return data
    .map((row) => Object.fromEntries(header.map((key, index) => [key, row[index] ?? ""])))
    .map((row) => ({
      warehouse: String(row["Warehouse"] ?? "").trim(),
      palletLocation: String(row["Pallet Location"] ?? "").trim(),
      skuCode: String(row["SKU"] ?? "").trim(),
      count: Number(String(row["Count"] ?? "0").trim()),
      productName: String(row["Product Name"] ?? "").trim(),
      category: String(row["Category"] ?? "").trim(),
    }))
    .filter((row) => row.warehouse && row.palletLocation && row.skuCode && Number.isFinite(row.count) && row.count > 0);
}

async function ensureInfrastructure(client: PoolClient) {
  await client.query(`
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

  await client.query(`
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

  await client.query(`
    create table if not exists pallet_stock_references (
      "id" text primary key,
      "warehouseId" text not null references warehouses("id"),
      "palletLocationId" text not null references pallet_locations("id"),
      "skuId" text references skus("id"),
      "skuCode" text not null,
      "productName" text not null,
      "category" text not null,
      "count" integer not null,
      "sourceName" text not null,
      "notes" text,
      "importedAt" timestamp(3) not null default current_timestamp
    )
  `);

  await client.query(`create index if not exists "pallet_stock_references_warehouseId_idx" on pallet_stock_references("warehouseId")`);
  await client.query(`create index if not exists "pallet_stock_references_palletLocationId_idx" on pallet_stock_references("palletLocationId")`);
  await client.query(`create index if not exists "pallet_stock_references_skuId_idx" on pallet_stock_references("skuId")`);
  await client.query(`create index if not exists "pallet_stock_references_skuCode_idx" on pallet_stock_references("skuCode")`);
}

function warehouseCodeFromName(name: string) {
  if (name.trim().toLowerCase() === "la mirada ca") {
    return "LA_MIRADA";
  }

  return name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

async function ensureWarehouse(client: PoolClient, warehouseName: string) {
  const code = warehouseCodeFromName(warehouseName);
  const existing = await client.query(`select * from warehouses where code = $1 limit 1`, [code]);
  const warehouse = existing.rows[0] as WarehouseRow | undefined;

  if (warehouse) {
    if (!warehouse.isPalletTracked) {
      await client.query(`update warehouses set "isPalletTracked" = true, "updatedAt" = now() where id = $1`, [warehouse.id]);
    }
    return { id: warehouse.id, code };
  }

  const id = randomUUID();
  await client.query(
    `
      insert into warehouses ("id", "code", "name", "isPalletTracked", "isActive", "updatedAt")
      values ($1, $2, $3, true, true, now())
    `,
    [id, code, warehouseName],
  );
  return { id, code };
}

async function ensurePalletLocation(client: PoolClient, warehouseId: string, palletCode: string) {
  const existing = await client.query(
    `select * from pallet_locations where "warehouseId" = $1 and code = $2 limit 1`,
    [warehouseId, palletCode],
  );
  const pallet = existing.rows[0] as PalletLocationRow | undefined;

  if (pallet) {
    return pallet.id;
  }

  const id = randomUUID();
  await client.query(
    `
      insert into pallet_locations (
        "id", "warehouseId", "code", "label", "zone", "isActive", "notes", "updatedAt"
      )
      values ($1, $2, $3, $4, $5, true, $6, now())
    `,
    [
      id,
      warehouseId,
      palletCode,
      palletCode,
      palletCode === "Unknown Pallet Location" ? "Exception" : null,
      palletCode === "Unknown Pallet Location"
        ? "Temporary bucket for pallet records awaiting physical stock verification."
        : null,
    ],
  );
  return id;
}

async function loadSkuMap(client: PoolClient) {
  const result = await client.query(`select id, "skuCode" from skus`);
  return new Map<string, string>((result.rows as SkuMatchRow[]).map((row) => [row.skuCode, row.id]));
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const sourceText = await readFile(options.source, "utf8");
  const rows = parseRows(sourceText);
  const client = await db.connect();

  try {
    await client.query("begin");
    await ensureInfrastructure(client);

    const warehouse = await ensureWarehouse(client, options.warehouseName);
    const sourceName = basename(options.source);
    const skuMap = await loadSkuMap(client);
    const distinctPallets = [...new Set(rows.map((row) => row.palletLocation))];
    let createdPallets = 0;
    let matchedSkuCount = 0;
    let unmatchedSkuCount = 0;

    const palletIdByCode = new Map<string, string>();
    for (const palletCode of distinctPallets) {
      const existing = await client.query(
        `select id from pallet_locations where "warehouseId" = $1 and code = $2 limit 1`,
        [warehouse.id, palletCode],
      );
      if (!existing.rowCount) {
        createdPallets += 1;
      }
      const palletId = await ensurePalletLocation(client, warehouse.id, palletCode);
      palletIdByCode.set(palletCode, palletId);
    }

    await client.query(`delete from pallet_stock_references where "warehouseId" = $1 and "sourceName" = $2`, [
      warehouse.id,
      sourceName,
    ]);

    for (const row of rows) {
      const skuId = skuMap.get(row.skuCode) ?? null;
      if (skuId) {
        matchedSkuCount += 1;
      } else {
        unmatchedSkuCount += 1;
      }

      await client.query(
        `
          insert into pallet_stock_references (
            "id", "warehouseId", "palletLocationId", "skuId", "skuCode",
            "productName", "category", "count", "sourceName", "notes"
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `,
        [
          randomUUID(),
          warehouse.id,
          palletIdByCode.get(row.palletLocation),
          skuId,
          row.skuCode,
          row.productName,
          row.category || "Uncategorized",
          row.count,
          sourceName,
          row.palletLocation === options.unknownPalletCode
            ? "Awaiting physical stock check before assigning a real pallet."
            : null,
        ],
      );
    }

    if (options.dryRun) {
      await client.query("rollback");
    } else {
      await client.query("commit");
    }

    console.log(JSON.stringify({
      dryRun: options.dryRun,
      warehouse: options.warehouseName,
      source: options.source,
      rowsProcessed: rows.length,
      distinctPallets: distinctPallets.length,
      createdPallets,
      matchedSkuRows: matchedSkuCount,
      unmatchedSkuRows: unmatchedSkuCount,
    }, null, 2));
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
    await db.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
