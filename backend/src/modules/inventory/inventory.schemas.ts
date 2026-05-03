import { z } from "zod";

const decimalString = z.coerce.number().min(0);
const paginationFields = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};

export const listSkusQuerySchema = z.object({
  ...paginationFields,
  search: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "DISCONTINUED"]).optional(),
  category: z.string().optional(),
  sortBy: z
    .enum(["updatedAt", "createdAt", "skuCode", "productName", "quantityOnHand", "available", "reorderLevel"])
    .default("updatedAt"),
  sortDirection: z.enum(["asc", "desc"]).default("desc"),
});

export const createSkuSchema = z.object({
  skuCode: z.string().min(1),
  productName: z.string().min(1),
  description: z.string().optional(),
  category: z.string().min(1),
  unit: z.string().min(1).default("piece"),
  unitCost: decimalString,
  sellingPrice: decimalString,
  reorderLevel: z.coerce.number().int().min(0).default(100),
  reorderQuantity: z.coerce.number().int().min(0).default(500),
  warehouseLocation: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "DISCONTINUED"]).default("ACTIVE"),
});

export const updateSkuSchema = createSkuSchema.partial();

export const createPalletLocationSchema = z.object({
  warehouseId: z.string().uuid(),
  code: z.string().min(1).max(50),
  label: z.string().min(1).max(100),
  zone: z.string().max(100).optional(),
  notes: z.string().max(1000).optional(),
  isActive: z.coerce.boolean().default(true),
});

export const updatePalletLocationSchema = createPalletLocationSchema.partial();

export const createMovementSchema = z
  .object({
    skuId: z.string().uuid(),
    movementType: z.enum(["INBOUND", "OUTBOUND", "ADJUSTMENT", "TRANSFER"]),
    quantity: z.coerce.number(),
    warehouseId: z.string().uuid().optional(),
    fromWarehouseId: z.string().uuid().optional(),
    toWarehouseId: z.string().uuid().optional(),
    palletLocationId: z.string().uuid().optional(),
    fromPalletLocationId: z.string().uuid().optional(),
    toPalletLocationId: z.string().uuid().optional(),
    referenceType: z.enum(["SALES_ORDER", "PHYSICAL_COUNT", "OTHER", "TRANSFER_WH_LOCATION"]).optional(),
    referenceId: z.string().optional(),
    reason: z.string().min(1).max(255).optional(),
    notes: z.string().max(2000).optional(),
    fromWarehouseLocation: z.string().max(255).optional(),
    toWarehouseLocation: z.string().max(255).optional(),
    fromPalletLocation: z.string().max(255).optional(),
    toPalletLocation: z.string().max(255).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.movementType === "INBOUND" || value.movementType === "OUTBOUND" || value.movementType === "TRANSFER") {
      if (!Number.isInteger(value.quantity) || value.quantity <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Inbound, outbound, and transfer quantities must be positive integers",
          path: ["quantity"],
        });
      }
    }

    if (value.movementType === "ADJUSTMENT") {
      if (!Number.isInteger(value.quantity) || value.quantity === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Adjustment quantity must be a non-zero integer",
          path: ["quantity"],
        });
      }
    }

    if (value.referenceType === "SALES_ORDER" && !value.referenceId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "referenceId is required when referenceType is SALES_ORDER",
        path: ["referenceId"],
      });
    }

    if (value.movementType === "TRANSFER") {
      if (!value.fromWarehouseId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "fromWarehouseId is required for transfer movements",
          path: ["fromWarehouseId"],
        });
      }

      if (!value.toWarehouseId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "toWarehouseId is required for transfer movements",
          path: ["toWarehouseId"],
        });
      }

      if (value.referenceType && value.referenceType !== "TRANSFER_WH_LOCATION") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Transfer movements must use reference type TRANSFER_WH_LOCATION",
          path: ["referenceType"],
        });
      }

      if (!value.toWarehouseLocation && !value.toPalletLocation) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Provide at least a destination warehouse location or pallet location for transfers",
          path: ["toWarehouseLocation"],
        });
      }
    } else if (!value.warehouseId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "warehouseId is required for inbound, outbound, and adjustment movements",
        path: ["warehouseId"],
      });
    }
  });

export const listMovementsQuerySchema = z.object({
  ...paginationFields,
  search: z.string().optional(),
  skuId: z.string().uuid().optional(),
  warehouseId: z.string().uuid().optional(),
  palletLocationId: z.string().uuid().optional(),
  user: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  movementType: z.enum(["INBOUND", "OUTBOUND", "ADJUSTMENT", "TRANSFER"]).optional(),
  referenceType: z.enum(["SALES_ORDER", "PHYSICAL_COUNT", "OTHER", "TRANSFER_WH_LOCATION"]).optional(),
  sortBy: z.enum(["createdAt", "quantity", "movementType"]).default("createdAt"),
  sortDirection: z.enum(["asc", "desc"]).default("desc"),
});

export const listPalletLocationsQuerySchema = z.object({
  warehouseId: z.string().uuid().optional(),
});
