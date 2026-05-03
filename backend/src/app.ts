import cors from "cors";
import express from "express";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/error-handler.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { customersRouter } from "./modules/customers/customers.routes.js";
import { dashboardRouter } from "./modules/dashboard/dashboard.routes.js";
import { inventoryRouter } from "./modules/inventory/inventory.routes.js";
import { ordersRouter } from "./modules/orders/orders.routes.js";
import { usersRouter } from "./modules/users/users.routes.js";

export function createApp() {
  const app = express();
  const allowedOrigins =
    env.ALLOWED_ORIGINS?.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean) ?? [];

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }

        callback(new Error("Origin is not allowed by CORS"));
      },
    }),
  );
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "gt-orders-stocks-backend" });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/customers", customersRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/inventory", inventoryRouter);
  app.use("/api/sales/orders", ordersRouter);
  app.use("/api/users", usersRouter);

  app.use(errorHandler);

  return app;
}
