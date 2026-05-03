import type { Request, Response } from "express";

export const dashboardController = {
  summary(_req: Request, res: Response) {
    res.json({
      message: "Dashboard summary scaffold",
      metrics: {
        draftOrders: 0,
        confirmedOrders: 0,
        totalSkus: 0,
        lowStockItems: 0,
      },
    });
  },
};

