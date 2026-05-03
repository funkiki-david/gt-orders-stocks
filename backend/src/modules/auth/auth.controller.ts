import type { Request, Response } from "express";
import { authService } from "./auth.service.js";
import { loginSchema, registerSchema } from "./auth.schemas.js";

export const authController = {
  async register(req: Request, res: Response) {
    const data = registerSchema.parse(req.body);
    const user = await authService.register(data);
    const token = authService.issueToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  },

  async login(req: Request, res: Response) {
    const data = loginSchema.parse(req.body);
    const user = await authService.login(data);
    const token = authService.issueToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  },

  me(req: Request, res: Response) {
    res.json({
      user: req.user,
    });
  },
};
