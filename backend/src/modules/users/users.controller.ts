import type { Request, Response } from "express";
import { createUserSchema, resetPasswordSchema, updateUserSchema } from "./users.schemas.js";
import { usersService } from "./users.service.js";

export const usersController = {
  async list(_req: Request, res: Response) {
    const result = await usersService.list();
    res.json(result);
  },

  async create(req: Request, res: Response) {
    const data = createUserSchema.parse(req.body);
    const result = await usersService.create(data);
    res.status(201).json(result);
  },

  async update(req: Request, res: Response) {
    const data = updateUserSchema.parse(req.body);
    const result = await usersService.update(String(req.params.id), data);
    res.json(result);
  },

  async resetPassword(req: Request, res: Response) {
    const data = resetPasswordSchema.parse(req.body ?? {});
    const result = await usersService.resetPassword(String(req.params.id), data.password);
    res.json(result);
  },
};
