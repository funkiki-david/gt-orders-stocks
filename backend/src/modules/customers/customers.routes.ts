import { Router } from "express";
import { customersController } from "./customers.controller.js";
import { authMiddleware, requireRole } from "../../middleware/auth.js";
import { asyncHandler } from "../../shared/http.js";
import { CUSTOMER_MANAGER_ROLES } from "../../shared/roles.js";

export const customersRouter = Router();

customersRouter.use(authMiddleware);
customersRouter.get("/", requireRole(CUSTOMER_MANAGER_ROLES), asyncHandler(customersController.list));
customersRouter.get("/:id/summary", requireRole(CUSTOMER_MANAGER_ROLES), asyncHandler(customersController.summary));
customersRouter.get("/:id", requireRole(CUSTOMER_MANAGER_ROLES), asyncHandler(customersController.getById));
customersRouter.post("/", requireRole(CUSTOMER_MANAGER_ROLES), asyncHandler(customersController.create));
customersRouter.put("/:id", requireRole(CUSTOMER_MANAGER_ROLES), asyncHandler(customersController.update));
