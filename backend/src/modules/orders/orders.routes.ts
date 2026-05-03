import { Router } from "express";
import { authMiddleware, requireRole } from "../../middleware/auth.js";
import { ordersController } from "./orders.controller.js";
import { asyncHandler } from "../../shared/http.js";
import { SALES_ORDER_MANAGER_ROLES } from "../../shared/roles.js";

export const ordersRouter = Router();

ordersRouter.use(authMiddleware);

ordersRouter.get("/", asyncHandler(ordersController.list));
ordersRouter.get("/:id/activity", asyncHandler(ordersController.activity));
ordersRouter.get("/:id", asyncHandler(ordersController.getById));
ordersRouter.post("/", requireRole(SALES_ORDER_MANAGER_ROLES), asyncHandler(ordersController.create));
ordersRouter.put("/:id", requireRole(SALES_ORDER_MANAGER_ROLES), asyncHandler(ordersController.update));
ordersRouter.delete("/:id", requireRole(SALES_ORDER_MANAGER_ROLES), asyncHandler(ordersController.remove));
ordersRouter.post("/:id/confirm", requireRole(SALES_ORDER_MANAGER_ROLES), asyncHandler(ordersController.confirm));
ordersRouter.post("/:id/cancel", requireRole(SALES_ORDER_MANAGER_ROLES), asyncHandler(ordersController.cancel));
ordersRouter.post("/:id/lines", requireRole(SALES_ORDER_MANAGER_ROLES), asyncHandler(ordersController.addLine));
ordersRouter.put(
  "/:id/lines/:lineId",
  requireRole(SALES_ORDER_MANAGER_ROLES),
  asyncHandler(ordersController.updateLine),
);
ordersRouter.delete(
  "/:id/lines/:lineId",
  requireRole(SALES_ORDER_MANAGER_ROLES),
  asyncHandler(ordersController.deleteLine),
);
