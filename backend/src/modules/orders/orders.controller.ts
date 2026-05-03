import type { Request, Response } from "express";
import {
  addOrderLineSchema,
  cancelOrderSchema,
  createOrderSchema,
  listOrdersQuerySchema,
  updateOrderLineSchema,
  updateOrderSchema,
} from "./orders.schemas.js";
import { ordersService } from "./orders.service.js";

export const ordersController = {
  async list(req: Request, res: Response) {
    const query = listOrdersQuerySchema.parse({
      page: req.query.page,
      pageSize: req.query.pageSize,
      search: Array.isArray(req.query.search) ? req.query.search[0] : req.query.search,
      status: Array.isArray(req.query.status) ? req.query.status[0] : req.query.status,
      customerId: Array.isArray(req.query.customerId) ? req.query.customerId[0] : req.query.customerId,
      skuId: Array.isArray(req.query.skuId) ? req.query.skuId[0] : req.query.skuId,
      dateFrom: Array.isArray(req.query.dateFrom) ? req.query.dateFrom[0] : req.query.dateFrom,
      dateTo: Array.isArray(req.query.dateTo) ? req.query.dateTo[0] : req.query.dateTo,
      sortBy: Array.isArray(req.query.sortBy) ? req.query.sortBy[0] : req.query.sortBy,
      sortDirection: Array.isArray(req.query.sortDirection)
        ? req.query.sortDirection[0]
        : req.query.sortDirection,
    });
    const result = await ordersService.list(query);
    res.json(result);
  },

  async getById(req: Request, res: Response) {
    const result = await ordersService.getById(String(req.params.id));
    res.json(result);
  },

  async activity(req: Request, res: Response) {
    const query = listOrdersQuerySchema.parse({
      page: req.query.page,
      pageSize: req.query.pageSize,
    });
    const result = await ordersService.activity(String(req.params.id), query.page, query.pageSize);
    res.json(result);
  },

  async create(req: Request, res: Response) {
    const data = createOrderSchema.parse(req.body);
    const result = await ordersService.create(data, req.user!.id);
    res.status(201).json(result);
  },

  async update(req: Request, res: Response) {
    const data = updateOrderSchema.parse(req.body);
    const result = await ordersService.update(String(req.params.id), data, req.user!.id);
    res.json(result);
  },

  async remove(req: Request, res: Response) {
    await ordersService.remove(String(req.params.id), req.user!.id);
    res.status(204).send();
  },

  async confirm(req: Request, res: Response) {
    const result = await ordersService.confirm(String(req.params.id), req.user!.id);
    res.json(result);
  },

  async cancel(req: Request, res: Response) {
    const data = cancelOrderSchema.parse(req.body ?? {});
    const result = await ordersService.cancel(String(req.params.id), req.user!.id, data.reason);
    res.json(result);
  },

  async addLine(req: Request, res: Response) {
    const data = addOrderLineSchema.parse(req.body);
    const result = await ordersService.addLine(String(req.params.id), data, req.user!.id);
    res.status(201).json(result);
  },

  async updateLine(req: Request, res: Response) {
    const data = updateOrderLineSchema.parse(req.body);
    const result = await ordersService.updateLine(
      String(req.params.id),
      String(req.params.lineId),
      data,
      req.user!.id,
    );
    res.json(result);
  },

  async deleteLine(req: Request, res: Response) {
    const result = await ordersService.deleteLine(
      String(req.params.id),
      String(req.params.lineId),
      req.user!.id,
    );
    res.json(result);
  },
};
