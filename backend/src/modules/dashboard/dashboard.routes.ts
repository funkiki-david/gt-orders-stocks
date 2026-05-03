import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.js";
import { dashboardController } from "./dashboard.controller.js";

export const dashboardRouter = Router();

dashboardRouter.use(authMiddleware);
dashboardRouter.get("/summary", dashboardController.summary);
