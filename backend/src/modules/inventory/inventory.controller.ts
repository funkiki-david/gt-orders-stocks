import type { Request, Response } from "express";
import {
  createMovementSchema,
  createPalletLocationSchema,
  createSkuSchema,
  listPalletLocationsQuerySchema,
  listMovementsQuerySchema,
  listSkusQuerySchema,
  updatePalletLocationSchema,
  updateSkuSchema,
} from "./inventory.schemas.js";
import { inventoryService } from "./inventory.service.js";

export const inventoryController = {
  async listWarehouses(_req: Request, res: Response) {
    const result = await inventoryService.listWarehouses();
    res.json(result);
  },

  async listPalletLocations(req: Request, res: Response) {
    const query = listPalletLocationsQuerySchema.parse({
      warehouseId: Array.isArray(req.query.warehouseId) ? req.query.warehouseId[0] : req.query.warehouseId,
    });
    const result = await inventoryService.listPalletLocations(query.warehouseId);
    res.json(result);
  },

  async palletStock(req: Request, res: Response) {
    const result = await inventoryService.palletStock(String(req.params.id));
    res.json(result);
  },

  async createPalletLocation(req: Request, res: Response) {
    const data = createPalletLocationSchema.parse(req.body);
    const result = await inventoryService.createPalletLocation(data, req.user!.id);
    res.status(201).json(result);
  },

  async updatePalletLocation(req: Request, res: Response) {
    const data = updatePalletLocationSchema.parse(req.body);
    const result = await inventoryService.updatePalletLocation(String(req.params.id), data, req.user!.id);
    res.json(result);
  },

  async deletePalletLocation(req: Request, res: Response) {
    await inventoryService.deletePalletLocation(String(req.params.id), req.user!.id);
    res.status(204).send();
  },

  async skuLocationBalances(req: Request, res: Response) {
    const result = await inventoryService.skuLocationBalances(String(req.params.id));
    res.json(result);
  },

  async listSkus(req: Request, res: Response) {
    const query = listSkusQuerySchema.parse({
      page: req.query.page,
      pageSize: req.query.pageSize,
      search: Array.isArray(req.query.search) ? req.query.search[0] : req.query.search,
      status: Array.isArray(req.query.status) ? req.query.status[0] : req.query.status,
      category: Array.isArray(req.query.category) ? req.query.category[0] : req.query.category,
      sortBy: Array.isArray(req.query.sortBy) ? req.query.sortBy[0] : req.query.sortBy,
      sortDirection: Array.isArray(req.query.sortDirection)
        ? req.query.sortDirection[0]
        : req.query.sortDirection,
    });
    const result = await inventoryService.listSkus(query);
    res.json(result);
  },

  async getSku(req: Request, res: Response) {
    const result = await inventoryService.getSku(String(req.params.id));
    res.json(result);
  },

  async createSku(req: Request, res: Response) {
    const data = createSkuSchema.parse(req.body);
    const result = await inventoryService.createSku(data, req.user!.id);
    res.status(201).json(result);
  },

  async updateSku(req: Request, res: Response) {
    const data = updateSkuSchema.parse(req.body);
    const result = await inventoryService.updateSku(String(req.params.id), data, req.user!.id);
    res.json(result);
  },

  async deleteSku(req: Request, res: Response) {
    await inventoryService.softDeleteSku(String(req.params.id), req.user!.id);
    res.status(204).send();
  },

  async createMovement(req: Request, res: Response) {
    const data = createMovementSchema.parse(req.body);
    const result = await inventoryService.createMovement(data, req.user!.id);
    res.status(201).json(result);
  },

  async listMovements(req: Request, res: Response) {
    const query = listMovementsQuerySchema.parse({
      page: req.query.page,
      pageSize: req.query.pageSize,
      search: Array.isArray(req.query.search) ? req.query.search[0] : req.query.search,
      skuId: Array.isArray(req.query.skuId) ? req.query.skuId[0] : req.query.skuId,
      warehouseId: Array.isArray(req.query.warehouseId) ? req.query.warehouseId[0] : req.query.warehouseId,
      palletLocationId: Array.isArray(req.query.palletLocationId)
        ? req.query.palletLocationId[0]
        : req.query.palletLocationId,
      user: Array.isArray(req.query.user) ? req.query.user[0] : req.query.user,
      dateFrom: Array.isArray(req.query.dateFrom) ? req.query.dateFrom[0] : req.query.dateFrom,
      dateTo: Array.isArray(req.query.dateTo) ? req.query.dateTo[0] : req.query.dateTo,
      movementType: Array.isArray(req.query.movementType)
        ? req.query.movementType[0]
        : req.query.movementType,
      referenceType: Array.isArray(req.query.referenceType)
        ? req.query.referenceType[0]
        : req.query.referenceType,
      sortBy: Array.isArray(req.query.sortBy) ? req.query.sortBy[0] : req.query.sortBy,
      sortDirection: Array.isArray(req.query.sortDirection)
        ? req.query.sortDirection[0]
        : req.query.sortDirection,
    });
    const result = await inventoryService.listMovements(query);
    res.json(result);
  },

  async skuHistory(req: Request, res: Response) {
    const query = listMovementsQuerySchema.parse({
      page: req.query.page,
      pageSize: req.query.pageSize,
    });
    const result = await inventoryService.skuHistory(String(req.params.id), query.page, query.pageSize);
    res.json(result);
  },

  async skuActivity(req: Request, res: Response) {
    const query = listMovementsQuerySchema.parse({
      page: req.query.page,
      pageSize: req.query.pageSize,
    });
    const result = await inventoryService.skuActivity(String(req.params.id), query.page, query.pageSize);
    res.json(result);
  },

  async dashboard(_req: Request, res: Response) {
    const result = await inventoryService.dashboard();
    res.json(result);
  },

  async lowStock(_req: Request, res: Response) {
    const result = await inventoryService.lowStock();
    res.json(result);
  },
};
