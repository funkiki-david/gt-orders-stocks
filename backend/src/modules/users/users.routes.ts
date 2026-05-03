import { Router } from "express";
import { authMiddleware, requireRole } from "../../middleware/auth.js";
import { asyncHandler } from "../../shared/http.js";
import { usersController } from "./users.controller.js";

export const usersRouter = Router();

usersRouter.use(authMiddleware);
usersRouter.use(requireRole(["ADMIN"]));

usersRouter.get("/", asyncHandler(usersController.list));
usersRouter.post("/", asyncHandler(usersController.create));
usersRouter.put("/:id", asyncHandler(usersController.update));
usersRouter.post("/:id/reset-password", asyncHandler(usersController.resetPassword));
