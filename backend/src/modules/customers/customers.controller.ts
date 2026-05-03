import type { Request, Response } from "express";
import {
  createCustomerSchema,
  listCustomersQuerySchema,
  updateCustomerSchema,
} from "./customers.schemas.js";
import { customersService } from "./customers.service.js";

export const customersController = {
  async list(req: Request, res: Response) {
    const query = listCustomersQuerySchema.parse({
      page: req.query.page,
      pageSize: req.query.pageSize,
      search: Array.isArray(req.query.search) ? req.query.search[0] : req.query.search,
    });
    const result = await customersService.list(query);
    res.json(result);
  },

  async getById(req: Request, res: Response) {
    const result = await customersService.getById(String(req.params.id));
    res.json(result);
  },

  async summary(req: Request, res: Response) {
    const result = await customersService.summary(String(req.params.id));
    res.json(result);
  },

  async create(req: Request, res: Response) {
    const data = createCustomerSchema.parse(req.body);
    const result = await customersService.create(data);
    res.status(201).json(result);
  },

  async update(req: Request, res: Response) {
    const data = updateCustomerSchema.parse(req.body);
    const result = await customersService.update(String(req.params.id), data);
    res.json(result);
  },
};
