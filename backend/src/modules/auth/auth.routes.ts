import { Router } from "express";
import { authController } from "./auth.controller.js";
import { authMiddleware } from "../../middleware/auth.js";
import { asyncHandler } from "../../shared/http.js";

export const authRouter = Router();

authRouter.post("/register", asyncHandler(authController.register));
authRouter.post("/login", asyncHandler(authController.login));
authRouter.get("/me", authMiddleware, authController.me);
