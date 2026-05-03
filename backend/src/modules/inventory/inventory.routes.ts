import { Router } from "express";
import { authMiddleware, requireRole } from "../../middleware/auth.js";
import { inventoryController } from "./inventory.controller.js";
import { asyncHandler } from "../../shared/http.js";
import { INVENTORY_OPERATOR_ROLES, PRODUCT_MANAGER_ROLES } from "../../shared/roles.js";

export const inventoryRouter = Router();

inventoryRouter.use(authMiddleware);

inventoryRouter.get("/warehouses", asyncHandler(inventoryController.listWarehouses));
inventoryRouter.get("/pallet-locations", asyncHandler(inventoryController.listPalletLocations));
inventoryRouter.get("/pallet-locations/:id/stock", asyncHandler(inventoryController.palletStock));
inventoryRouter.post(
  "/pallet-locations",
  requireRole(INVENTORY_OPERATOR_ROLES),
  asyncHandler(inventoryController.createPalletLocation),
);
inventoryRouter.put(
  "/pallet-locations/:id",
  requireRole(INVENTORY_OPERATOR_ROLES),
  asyncHandler(inventoryController.updatePalletLocation),
);
inventoryRouter.delete(
  "/pallet-locations/:id",
  requireRole(INVENTORY_OPERATOR_ROLES),
  asyncHandler(inventoryController.deletePalletLocation),
);
inventoryRouter.get("/skus", asyncHandler(inventoryController.listSkus));
inventoryRouter.get("/skus/:id", asyncHandler(inventoryController.getSku));
inventoryRouter.get("/skus/:id/location-balances", asyncHandler(inventoryController.skuLocationBalances));
inventoryRouter.post("/skus", requireRole(PRODUCT_MANAGER_ROLES), asyncHandler(inventoryController.createSku));
inventoryRouter.put("/skus/:id", requireRole(PRODUCT_MANAGER_ROLES), asyncHandler(inventoryController.updateSku));
inventoryRouter.delete("/skus/:id", requireRole(PRODUCT_MANAGER_ROLES), asyncHandler(inventoryController.deleteSku));

inventoryRouter.post(
  "/movements",
  requireRole(INVENTORY_OPERATOR_ROLES),
  asyncHandler(inventoryController.createMovement),
);
inventoryRouter.get("/movements", asyncHandler(inventoryController.listMovements));
inventoryRouter.get("/skus/:id/history", asyncHandler(inventoryController.skuHistory));
inventoryRouter.get("/skus/:id/activity", asyncHandler(inventoryController.skuActivity));
inventoryRouter.get("/dashboard", asyncHandler(inventoryController.dashboard));
inventoryRouter.get("/low-stock", asyncHandler(inventoryController.lowStock));
