import { z } from "zod";
import { APP_ROLES } from "../../shared/roles.js";

export const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(APP_ROLES),
  password: z.string().min(8).default("admin123"),
});

export const updateUserSchema = z
  .object({
    name: z.string().min(1).optional(),
    role: z.enum(APP_ROLES).optional(),
    active: z.boolean().optional(),
  })
  .refine((value) => value.name !== undefined || value.role !== undefined || value.active !== undefined, {
    message: "At least one field must be provided",
  });

export const resetPasswordSchema = z.object({
  password: z.string().min(8).default("admin123"),
});
